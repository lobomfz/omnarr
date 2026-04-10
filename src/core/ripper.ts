import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { DownloadEvents } from '@/core/download-events'
import { DbDownloads } from '@/db/downloads'
import { SuperflixAdapter } from '@/integrations/indexers/superflix'
import { Formatters } from '@/lib/formatters'
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
  private lastPublishAt = 0

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
    if (this.ctx.season_number == null || this.ctx.episode_number == null) {
      return [{ tag: '', dir: this.ctx.tracks_dir }]
    }

    const seTag = Formatters.seasonEpisodeTag(
      this.ctx.season_number,
      this.ctx.episode_number
    )

    return [
      {
        tag: seTag,
        dir: join(
          this.ctx.tracks_dir,
          Formatters.seasonEpisodeDir(
            this.ctx.season_number,
            this.ctx.episode_number
          )
        ),
        episode: {
          season: this.ctx.season_number,
          episode: this.ctx.episode_number,
        },
      },
    ]
  }

  private async gatherEntries() {
    const units = this.resolveUnits()
    const entries: RipperEntry[] = []

    for (const unit of units) {
      await this.gatherUnit(unit, entries).catch((err) =>
        Log.warn(
          `ripper failed unit=${unit.tag || 'movie'} error="${err.message}"`
        )
      )
    }

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

    await this.publishProgress(0)

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]

      this.lastPublishAt = 0

      await this.ripEntry(entry, tmpPath, i, entries.length)
        .then(() => {
          ripped++
        })
        .catch((err) =>
          Log.warn(`ripper failed tag=${entry.tag} error="${err.message}"`)
        )

      this.lastPublishAt = 0
      await this.publishProgress((i + 1) / entries.length)
    }

    await this.publishProgress(1)

    return { ripped, total: entries.length }
  }

  private async publishProgress(progress: number) {
    await DbDownloads.update(this.ctx.download_id, { progress })

    await DownloadEvents.publish(this.ctx.download_id)
  }

  private async ripEntry(
    entry: RipperEntry,
    tmpPath: string,
    completed: number,
    total: number
  ) {
    const tmpFile = join(tmpPath, `${entry.tag.replaceAll(' ', '_')}.ts`)

    await this.client.downloadStream(
      entry.stream,
      tmpFile,
      (downloaded, downloadTotal) => {
        const now = Date.now()

        if (now - this.lastPublishAt < 500) {
          return
        }

        this.lastPublishAt = now

        const ratio = (completed + downloaded / downloadTotal) / total

        this.publishProgress(ratio).catch(Log.warn)
      }
    )

    await mkdir(dirname(entry.outputPath), { recursive: true })

    await new FFmpegBuilder({ overwrite: true })
      .input(tmpFile)
      .codec(entry.codec, 'copy')
      .output(entry.outputPath)
      .run()
  }
}
