import { config } from '@/config'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbMediaTracks, type TracksWithFile } from '@/db/media-tracks'
import { Log } from '@/log'
import { HlsServer } from '@/player/hls-server'
import { Transcoder } from '@/player/transcoder'

type TrackSelection = {
  video?: number
  audio?: number
  sub?: number
}

export class Player {
  private server?: HlsServer

  constructor(private media: { id: string; episode_id?: number }) {}

  async start(selection: TrackSelection, opts: { port?: number }) {
    const resolved = await this.resolveTracks(selection)

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
      port: opts.port ?? 8787,
      mediaId: this.media.id,
    })

    await this.server.start()

    return { url: this.server.url, ...resolved }
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
    const allTracks = await DbMediaTracks.getWithFile({
      media_id: this.media.id,
      episode_id: this.media.episode_id,
    })

    if (allTracks.length === 0) {
      throw new Error('No tracks found. Run scan first.')
    }

    const byType = Map.groupBy(allTracks, (t) => t.stream_type)

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
