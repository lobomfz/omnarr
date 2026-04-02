import { config } from '@/lib/config'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { type TracksWithFile } from '@/db/media-tracks'
import { Log } from '@/lib/log'
import { HlsServer } from '@/player/hls-server'
import { Transcoder } from '@/player/transcoder'
import { TrackResolver } from '@/audio/track-resolver'

type TrackSelection = {
  video?: number
  audio?: number
  sub?: number
}

export class Player extends TrackResolver {
  private server?: HlsServer

  async start(selection: TrackSelection, opts: { port?: number }) {
    const resolved = await this.resolveTracks(selection)

    const audioOffset = await this.resolveAudioOffset(resolved)
    const subtitleSync = await this.resolveSubtitleSync(resolved)

    const [transcode, segments] = await Promise.all([
      Transcoder.init(resolved, config.transcoding),
      DbMediaKeyframes.getSegmentsByFileId(resolved.video.file_id),
    ])

    if (segments.length === 0) {
      throw new Error('No keyframes found. Run scan first.')
    }

    Log.info(
      `player start segments=${segments.length} video=${resolved.video.file_path} audio=${resolved.audio.file_path}`
    )

    this.server = new HlsServer({
      resolved,
      segments,
      transcode,
      audioOffset,
      subtitleOffset: subtitleSync.offset,
      port: opts.port ?? 8787,
      mediaId: this.media.id,
    })

    await this.server.start()

    return {
      url: this.server.url,
      audioOffset,
      subtitleOffset: subtitleSync.offset,
      subtitleConfidence: subtitleSync.confidence,
      ...resolved,
    }
  }

  async stop() {
    await this.server?.stop()
  }

  async play(url: string) {
    const proc = Bun.spawn(['mpv', url], {
      stdio: ['inherit', 'inherit', 'inherit'],
    })

    await proc.exited

    await this.server?.stop()
  }

  async resolveTracks(selection: TrackSelection) {
    const byType = await this.getTracks()

    const video = this.pickTrack(byType.get('video'), 'video', selection.video)
    const audio = this.pickTrack(byType.get('audio'), 'audio', selection.audio)

    if (selection.sub === undefined) {
      return { video, audio, subtitle: null }
    }

    const subtitle = this.pickTrack(
      byType.get('subtitle'),
      'subtitle',
      selection.sub
    )

    return { video, audio, subtitle }
  }

  async resolveAudioOffset(resolved: {
    video: { download_id: number; file_id: number }
    audio: { download_id: number; file_id: number }
  }) {
    if (resolved.video.download_id === resolved.audio.download_id) {
      return 0
    }

    const result = await this.resolveOffset(
      resolved.video.file_id,
      resolved.audio.file_id
    )

    return result.offset
  }

  async resolveSubtitleSync(resolved: {
    video: { download_id: number; file_id: number }
    audio: { download_id: number; file_id: number }
    subtitle: { download_id: number; file_path: string } | null
  }) {
    const noSync = { offset: 0, confidence: null as number | null }

    if (!resolved.subtitle) {
      return noSync
    }

    if (resolved.subtitle.download_id === resolved.video.download_id) {
      return noSync
    }

    const audioFileId =
      resolved.video.file_id === resolved.audio.file_id
        ? resolved.video.file_id
        : resolved.audio.file_id

    const result = await this.resolveSubtitleOffset(
      audioFileId,
      resolved.subtitle.file_path
    )

    if (result.confidence === null || result.offset === 0) {
      return result
    }

    return {
      offset: result.offset + config.subtitle_delay,
      confidence: result.confidence,
    }
  }

  private pickTrack(
    tracks: TracksWithFile | undefined,
    type: string,
    index?: number
  ) {
    if (!tracks || tracks.length === 0) {
      throw new Error(`No ${type} tracks found.`)
    }

    if (index !== undefined) {
      if (index < 0 || index >= tracks.length) {
        throw new Error(
          `${type} index ${index} out of range (0-${tracks.length - 1}).`
        )
      }

      return tracks[index]
    }

    const defaults = tracks.filter((t) => t.is_default)

    if (defaults.length > 0) {
      return defaults[0]
    }

    return tracks[0]
  }
}
