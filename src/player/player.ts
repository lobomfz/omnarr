import { TrackResolver } from '@/audio/track-resolver'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { type TracksWithFile } from '@/db/media-tracks'
import { config } from '@/lib/config'
import { Log } from '@/lib/log'
import { HlsServer } from '@/player/hls-server'
import { Transcoder } from '@/player/transcoder'
import { OmnarrError } from '@/shared/errors'

type TrackSelection = {
  video: number
  audio: number
  sub?: number
}

export class Player extends TrackResolver {
  private server?: HlsServer

  async start(selection: TrackSelection) {
    const resolved = await this.resolveTracks(selection)

    const { audioSync, subtitleSync } = await this.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: resolved.subtitle,
    })

    const subtitleOffset = subtitleSync.confidence
      ? subtitleSync.offset + config.subtitle_delay
      : 0

    const [transcode, segments] = await Promise.all([
      Transcoder.init(resolved, config.transcoding, audioSync.speed),
      DbMediaKeyframes.getSegmentsByTrackId(resolved.video.id),
    ])

    if (segments.length === 0) {
      throw new OmnarrError('NO_KEYFRAMES')
    }

    Log.info(
      `player start segments=${segments.length} video=${resolved.video.file_path} audio=${resolved.audio.file_path} speed=${audioSync.speed.toFixed(4)}`
    )

    this.server = new HlsServer({
      resolved,
      segments,
      transcode,
      audioOffset: audioSync.offset,
      audioSpeed: audioSync.speed,
      subtitleOffset,
      subtitleSpeed: subtitleSync.speed,
      mediaId: this.media.id,
    })

    await this.server.start()

    return {
      hlsPath: this.server.hlsPath,
      audioOffset: audioSync.offset,
      audioSpeed: audioSync.speed,
      subtitleOffset,
      subtitleSpeed: subtitleSync.speed,
      subtitleConfidence: subtitleSync.confidence,
      ...resolved,
    }
  }

  async stop() {
    await this.server?.stop()
  }

  async handle(req: Request) {
    if (!this.server) {
      return new Response('No active HLS server', { status: 404 })
    }

    return await this.server.handle(req)
  }

  async resolveTracks(selection: TrackSelection) {
    const byType = await this.getTracks()

    const video = this.pickTrack(byType.get('video'), selection.video)
    const audio = this.pickTrack(byType.get('audio'), selection.audio)

    if (selection.sub === undefined) {
      return { video, audio, subtitle: null }
    }

    const subtitle = this.pickTrack(byType.get('subtitle'), selection.sub)

    return { video, audio, subtitle }
  }

  private pickTrack(tracks: TracksWithFile | undefined, trackId: number) {
    if (!tracks || tracks.length === 0) {
      throw new OmnarrError('NO_TRACKS')
    }

    const track = tracks.find((t) => t.id === trackId)

    if (!track) {
      throw new OmnarrError('TRACK_NOT_FOUND')
    }

    return track
  }
}
