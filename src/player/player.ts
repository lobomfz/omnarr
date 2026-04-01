import { AudioCorrelator, MIN_SYNC_CONFIDENCE } from '@/audio-correlator'
import { config } from '@/config'
import { DbMediaEnvelopes } from '@/db/media-envelopes'
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

    const audioOffset = await this.resolveAudioOffset(resolved)

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
      port: opts.port ?? 8787,
      mediaId: this.media.id,
    })

    await this.server.start()

    return { url: this.server.url, audioOffset, ...resolved }
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

  async resolveAudioOffset(resolved: {
    video: { download_id: number; file_id: number }
    audio: { download_id: number; file_id: number }
  }) {
    if (resolved.video.download_id === resolved.audio.download_id) {
      return 0
    }

    const [videoEnv, audioEnv] = await Promise.all([
      DbMediaEnvelopes.getByMediaFileId(resolved.video.file_id),
      DbMediaEnvelopes.getByMediaFileId(resolved.audio.file_id),
    ])

    if (!videoEnv || !audioEnv) {
      Log.warn(
        `audio sync skipped: missing envelope video=${!!videoEnv} audio=${!!audioEnv}`
      )
      return 0
    }

    const videoData = new Int8Array(
      videoEnv.data.buffer,
      videoEnv.data.byteOffset,
      videoEnv.data.byteLength
    )
    const audioData = new Int8Array(
      audioEnv.data.buffer,
      audioEnv.data.byteOffset,
      audioEnv.data.byteLength
    )

    const result = AudioCorrelator.correlate(
      videoData,
      audioData,
      videoEnv.sample_rate,
      videoEnv.window_size
    )

    if (result.confidence < MIN_SYNC_CONFIDENCE) {
      Log.warn(
        `audio sync skipped: low confidence=${result.confidence.toFixed(1)} offset=${result.offsetSeconds.toFixed(3)}s`
      )
      return 0
    }

    Log.info(
      `audio sync applied: offset=${result.offsetSeconds.toFixed(3)}s confidence=${result.confidence.toFixed(1)}`
    )

    return result.offsetSeconds
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
