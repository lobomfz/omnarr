import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { AudioCorrelator, MIN_SYNC_CONFIDENCE } from '@/audio-correlator'
import { DbMediaTracks, type TracksWithFile } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'
import { Log } from '@/log'

type ResolvedTracks = Awaited<ReturnType<Exporter['resolveTracks']>>

type Track = TracksWithFile[number]

export class Exporter {
  constructor(private media: { id: string; episode_id?: number }) {}

  async resolveTracks(opts: { video?: number }) {
    const allTracks = await DbMediaTracks.getWithFile({
      media_id: this.media.id,
      episode_id: this.media.episode_id,
    })

    if (allTracks.length === 0) {
      throw new Error('No tracks found. Run scan first.')
    }

    const byType = Map.groupBy(allTracks, (t) => t.stream_type)

    const videoTracks = byType.get('video') ?? []
    const audioTracks = byType.get('audio') ?? []
    const subtitleTracks = byType.get('subtitle') ?? []

    if (videoTracks.length === 0) {
      throw new Error('No video tracks found.')
    }

    const video = this.pickVideo(videoTracks, opts.video)

    return { video, audio: audioTracks, subtitle: subtitleTracks }
  }

  async resolveOffsets(resolved: ResolvedTracks) {
    const offsets = new Map<number, number>()
    const allTracks = [resolved.video, ...resolved.audio, ...resolved.subtitle]
    const downloadIds = new Set(allTracks.map((t) => t.download_id))

    offsets.set(resolved.video.download_id, 0)

    const videoVad = await this.loadVad(resolved.video.file_id)

    for (const dlId of downloadIds) {
      if (dlId === resolved.video.download_id) {
        continue
      }

      if (!videoVad) {
        Log.warn(`export offset skipped: missing vad for video file`)
        offsets.set(dlId, 0)
        continue
      }

      const dlTrack = allTracks.find(
        (t) => t.download_id === dlId && t.file_id !== resolved.video.file_id
      )

      if (!dlTrack) {
        offsets.set(dlId, 0)
        continue
      }

      const dlVad = await this.loadVad(dlTrack.file_id)

      if (!dlVad) {
        Log.warn(`export offset skipped: missing vad for download=${dlId}`)
        offsets.set(dlId, 0)
        continue
      }

      const result = AudioCorrelator.correlateTimestamps(videoVad, dlVad)

      if (result.confidence < MIN_SYNC_CONFIDENCE) {
        Log.warn(
          `export offset skipped: low confidence=${result.confidence.toFixed(1)} download=${dlId}`
        )
        offsets.set(dlId, 0)
        continue
      }

      Log.info(
        `export offset applied: offset=${result.offsetSeconds.toFixed(3)}s confidence=${result.confidence.toFixed(1)} download=${dlId}`
      )
      offsets.set(dlId, result.offsetSeconds)
    }

    return offsets
  }

  buildCommand(
    resolved: ResolvedTracks,
    offsets: Map<number, number>,
    output: string
  ) {
    return this.createBuilder(resolved, offsets, output).toArgs()
  }

  async export(opts: {
    video?: number
    output: string
    onProgress: (ratio: number) => void
  }) {
    if (await Bun.file(opts.output).exists()) {
      throw new Error(`Output file already exists: ${opts.output}`)
    }

    const resolved = await this.resolveTracks({ video: opts.video })
    const offsets = await this.resolveOffsets(resolved)

    Log.info(
      `export start output=${opts.output} tracks=${1 + resolved.audio.length + resolved.subtitle.length}`
    )

    await this.createBuilder(resolved, offsets, opts.output).run({
      duration: resolved.video.file_duration ?? 0,
      onProgress: opts.onProgress,
    })

    Log.info(`export complete output=${opts.output}`)
  }

  private createBuilder(
    resolved: ResolvedTracks,
    offsets: Map<number, number>,
    output: string
  ) {
    const orderedTracks: Track[] = [
      resolved.video,
      ...resolved.audio,
      ...resolved.subtitle,
    ]

    const fileIndex = new Map<string, number>()
    let builder = new FFmpegBuilder({ overwrite: true })

    for (const track of orderedTracks) {
      if (fileIndex.has(track.file_path)) {
        continue
      }

      const offset = offsets.get(track.download_id) ?? 0

      if (offset !== 0) {
        builder = builder.rawInput('-itsoffset', String(offset))
      }

      builder = builder.input(track.file_path)
      fileIndex.set(track.file_path, fileIndex.size)
    }

    for (const track of orderedTracks) {
      const inputIdx = fileIndex.get(track.file_path)!

      builder = builder.map(`${inputIdx}:${track.stream_index}`)
    }

    builder = builder.raw('-c', 'copy')

    for (let i = 0; i < orderedTracks.length; i++) {
      const track = orderedTracks[i]

      if (track.language) {
        builder = builder.raw(`-metadata:s:${i}`, `language=${track.language}`)
      }

      if (track.title) {
        builder = builder.raw(`-metadata:s:${i}`, `title=${track.title}`)
      }

      if (track.is_default) {
        builder = builder.raw(`-disposition:s:${i}`, 'default')
      }
    }

    return builder.output(output)
  }

  private async loadVad(fileId: number) {
    const vad = await DbMediaVad.getByMediaFileId(fileId)

    if (!vad) {
      return null
    }

    return new Float32Array(
      vad.data.buffer,
      vad.data.byteOffset,
      vad.data.byteLength / Float32Array.BYTES_PER_ELEMENT
    )
  }

  private pickVideo(tracks: TracksWithFile, index?: number) {
    if (index !== undefined) {
      if (index < 0 || index >= tracks.length) {
        throw new Error(
          `Video index ${index} out of range (0-${tracks.length - 1}).`
        )
      }

      return tracks[index]
    }

    if (tracks.length === 1) {
      return tracks[0]
    }

    const listing = tracks
      .map(
        (t, i) =>
          `  ${i}: ${t.codec_name} ${t.width}x${t.height} (${t.file_path})`
      )
      .join('\n')

    throw new Error(
      `Multiple video tracks found. Use --video to select:\n${listing}`
    )
  }
}
