import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'
import PQueue from 'p-queue'

import { PubSub } from '@/api/pubsub'
import { DbDownloads } from '@/db/downloads'
import { SuperflixAdapter } from '@/integrations/indexers/superflix'
import { Log } from '@/lib/log'

interface RipperUnit {
  tag: string
  dir: string
  episode?: { season: number; episode: number }
}

interface RipperEntry {
  tag: string
  stream: { url: string; referer: string }
  outputPath: string
  codec: 'v' | 'a'
}

export class Ripper {
  private client = new SuperflixAdapter()

  constructor(
    private ctx: {
      download_id: number
      media_id: string
      source_id: string
      imdb_id: string
      tracks_dir: string
      audio_only?: boolean
      season_number?: number | null
      episode_number?: number | null
    }
  ) {}

  async run() {
    await DbDownloads.update(this.ctx.download_id, { status: 'downloading' })

    Log.info(
      `ripper start imdb=${this.ctx.imdb_id} audio_only=${!!this.ctx.audio_only} season=${this.ctx.season_number ?? 'none'}`
    )

    const entries = await this.gatherEntries()
    const result = await this.ripEntries(entries)

    Log.info(`ripper complete ripped=${result.ripped}/${result.total}`)

    return result
  }

  private resolveUnits(): RipperUnit[] {
    if (this.ctx.season_number == null) {
      return [{ tag: '', dir: this.ctx.tracks_dir }]
    }

    const seTag = `S${String(this.ctx.season_number).padStart(2, '0')}E${String(this.ctx.episode_number!).padStart(2, '0')}`

    return [
      {
        tag: seTag,
        dir: join(this.ctx.tracks_dir, seTag.toLowerCase()),
        episode: {
          season: this.ctx.season_number,
          episode: this.ctx.episode_number!,
        },
      },
    ]
  }

  private async gatherEntries() {
    const units = this.resolveUnits()
    const entries: RipperEntry[] = []
    const queue = new PQueue({ concurrency: 1 })

    for (const unit of units) {
      queue.add(() =>
        this.gatherUnit(unit, entries).catch((err) =>
          Log.warn(
            `ripper failed unit=${unit.tag || 'movie'} error="${err.message}"`
          )
        )
      )
    }

    await queue.onIdle()

    return entries
  }

  private async gatherUnit(unit: RipperUnit, entries: RipperEntry[]) {
    const streams = await this.client.getStreams(this.ctx.imdb_id, unit.episode)

    if (!this.ctx.audio_only && streams.video) {
      entries.push({
        tag: unit.tag ? `${unit.tag} VIDEO` : 'VIDEO',
        stream: streams.video,
        outputPath: join(unit.dir, 'video.mkv'),
        codec: 'v',
      })
    }

    const audioStreams = streams.audio

    for (let i = 0; i < audioStreams.length; i++) {
      const s = audioStreams[i]
      const label = s.lang ?? String(i)

      entries.push({
        tag: unit.tag
          ? `${unit.tag} ${label.toUpperCase()}`
          : label.toUpperCase(),
        stream: s,
        outputPath: join(unit.dir, `audio_${label}.mka`),
        codec: 'a',
      })
    }
  }

  private async ripEntries(entries: RipperEntry[]) {
    const tmpPath = join(tmpdir(), `omnarr-dl-${this.ctx.media_id}`)

    await mkdir(tmpPath, { recursive: true })

    await using _ = {
      [Symbol.asyncDispose]: async () => {
        await rm(tmpPath, { recursive: true }).catch((err) =>
          Log.warn(`failed to cleanup temp dir path=${tmpPath} error=${err}`)
        )
      },
    }

    let ripped = 0
    let completed = 0

    const queue = new PQueue({ concurrency: 1 })

    this.publishProgress(0)

    for (const entry of entries) {
      queue.add(() =>
        this.ripEntry(entry, tmpPath)
          .then(() => {
            ripped++
          })
          .catch((err) =>
            Log.warn(`ripper failed tag=${entry.tag} error="${err.message}"`)
          )
          .then(async () => {
            completed++

            const progress = completed / entries.length

            this.publishProgress(progress)

            await DbDownloads.update(this.ctx.download_id, { progress })
          })
      )
    }

    await queue.onIdle()

    this.publishProgress(1)

    return { ripped, total: entries.length }
  }

  private publishProgress(progress: number) {
    PubSub.publish('download_progress', {
      id: this.ctx.download_id,
      media_id: this.ctx.media_id,
      source_id: this.ctx.source_id,
      progress,
      speed: 0,
      eta: 0,
      status: 'downloading',
    })
  }

  private async ripEntry(entry: RipperEntry, tmpPath: string) {
    const tmpFile = join(tmpPath, `${entry.tag.replaceAll(' ', '_')}.ts`)

    await this.client.downloadStream(entry.stream, tmpFile, () => {})

    await mkdir(dirname(entry.outputPath), { recursive: true })

    await new FFmpegBuilder({ overwrite: true })
      .input(tmpFile)
      .codec(entry.codec, 'copy')
      .output(entry.outputPath)
      .run()
  }
}
