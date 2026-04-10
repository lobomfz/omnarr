import { link, stat } from 'fs/promises'
import { dirname } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { PubSub } from '@/api/pubsub'
import { TrackResolver } from '@/audio/track-resolver'
import { DbMediaFiles } from '@/db/media-files'
import { type TracksWithFile } from '@/db/media-tracks'
import { Log } from '@/lib/log'

type ResolvedTracks = Awaited<ReturnType<Exporter['resolveTracks']>>

type Track = TracksWithFile[number]

export class Exporter extends TrackResolver {
  async resolveTracks(opts: { video?: number }) {
    const byType = await this.getTracks()

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

    for (const dlId of downloadIds) {
      if (dlId === resolved.video.download_id) {
        continue
      }

      const dlTrack = allTracks.find(
        (t) => t.download_id === dlId && t.file_id !== resolved.video.file_id
      )

      if (!dlTrack) {
        offsets.set(dlId, 0)
        continue
      }

      const result = await this.resolveOffset(
        resolved.video.file_id,
        dlTrack.file_id
      )

      offsets.set(dlId, result.offset)
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

  async export(opts: { video?: number; output: string }) {
    if (await Bun.file(opts.output).exists()) {
      throw new Error(`Output file already exists: ${opts.output}`)
    }

    const strategy = await this.resolveStrategy({
      video: opts.video,
      output: opts.output,
    })

    if (strategy.type === 'link') {
      await link(strategy.sourcePath, opts.output)

      Log.info(`export hardlink output=${opts.output}`)

      return 'hardlink' as const
    }

    Log.info(
      `export start output=${opts.output} tracks=${1 + strategy.resolved.audio.length + strategy.resolved.subtitle.length}`
    )

    await this.createBuilder(
      strategy.resolved,
      strategy.offsets,
      opts.output
    ).run({
      duration: strategy.resolved.video.file_duration ?? 0,
      onProgress: (ratio) => {
        PubSub.publish('export_progress', {
          media_id: this.media.id,
          output: opts.output,
          ratio,
        })
      },
    })

    Log.info(`export complete output=${opts.output}`)

    return 'mux' as const
  }

  private async resolveStrategy(opts: { video?: number; output: string }) {
    const resolved = await this.resolveTracks({ video: opts.video })

    const fileCount = await DbMediaFiles.countByMedia(
      this.media.id,
      this.media.episode_id
    )

    if (fileCount === 1) {
      const sourcePath = resolved.video.file_path

      const [sourceStat, outputDirStat] = await Promise.all([
        stat(sourcePath),
        stat(dirname(opts.output)),
      ])

      if (sourceStat.dev === outputDirStat.dev) {
        return { type: 'link' as const, sourcePath }
      }
    }

    const offsets = await this.resolveOffsets(resolved)

    return { type: 'mux' as const, resolved, offsets }
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
