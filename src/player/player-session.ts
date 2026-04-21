import { DbMediaTracks } from '@/db/media-tracks'
import { Log } from '@/lib/log'
import { Player } from '@/player/player'
import { OmnarrError } from '@/shared/errors'

const INACTIVITY_MS = 5 * 60 * 1000

export class PlayerSessionManager {
  private player: Player | null = null
  private timer: Timer | null = null

  constructor(private inactivityMs = INACTIVITY_MS) {}

  async start(opts: {
    media_id: string
    video: number
    audio: number
    sub?: number
  }) {
    await this.stop()

    const trackIds = [
      ...new Set(
        [opts.video, opts.audio, opts.sub].filter(
          (id): id is number => id !== undefined
        )
      ),
    ]
    const rows = await DbMediaTracks.getFileContext(opts.media_id, trackIds)

    if (rows.length !== trackIds.length) {
      throw new OmnarrError('TRACK_NOT_FOUND')
    }

    const videoContext = rows.find((r) => r.id === opts.video)

    if (!videoContext) {
      throw new OmnarrError('TRACK_NOT_FOUND')
    }

    const episodeMismatch = rows.some(
      (r) => r.episode_id !== videoContext.episode_id
    )

    if (episodeMismatch) {
      throw new OmnarrError('TRACK_EPISODE_MISMATCH')
    }

    this.player = new Player({
      id: opts.media_id,
      episode_id: videoContext.episode_id,
    })

    try {
      const result = await this.player.start({
        video: opts.video,
        audio: opts.audio,
        sub: opts.sub,
      })

      this.resetTimer()

      Log.info(`player session started media=${opts.media_id}`)

      return result
    } catch (err) {
      this.player = null
      throw err
    }
  }

  async stop() {
    this.clearTimer()

    if (!this.player) {
      return
    }

    await this.player.stop()
    this.player = null

    Log.info('player session stopped')
  }

  async handle(req: Request) {
    if (!this.player) {
      return new Response('No active session', { status: 404 })
    }

    this.resetTimer()

    return await this.player.handle(req)
  }

  get active() {
    return this.player !== null
  }

  private resetTimer() {
    this.clearTimer()

    this.timer = setTimeout(() => {
      Log.info('player session timed out')
      this.stop().catch((err: any) => {
        Log.error(`player session stop failed: ${err.message}`)
      })
    }, this.inactivityMs)
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

export const playerSession = new PlayerSessionManager()
