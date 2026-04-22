import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'
import PQueue from 'p-queue'

import { DbDownloads } from '@/db/downloads'
import { SuperflixAdapter } from '@/integrations/indexers/superflix'
import { Log } from '@/lib/log'

import type { DownloadSource, DownloadData } from './types/download-source'

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

export class RipperDownload implements DownloadSource {
  private client = new SuperflixAdapter()

  private ripped = 0
  private completed = 0

  constructor(public onProgress: DownloadSource['onProgress']) {}

  add: DownloadSource['add'] = async (
    data: DownloadData,
    concurrency?: number
  ) => {
    Log.info(
      `ripper start imdb=${data.imdb_id} title="${data.title}" audio_only=${!!data.audio_only} season=${data.season_number ?? 'none'}`
    )

    const effectiveConcurrency = concurrency ?? 1

    const entries = await this.gatherEntries(
      data,
      data.tracksDir,
      effectiveConcurrency
    )

    this.onProgress('Gathering', 'completed', 1)

    await DbDownloads.deleteIncomplete(data.source_id)

    const download = await DbDownloads.create({
      media_id: data.media_id,
      source_id: data.source_id,
      download_url: data.download_url,
      source: 'ripper',
      status: 'downloading',
    })

    await this.ripEntries(
      entries,
      download.id,
      data.media_id,
      effectiveConcurrency
    )

    await DbDownloads.update(
      download.id,
      this.ripped > 0
        ? {
            status: 'completed',
            progress: 1,
            content_path: data.tracksDir,
          }
        : {
            status: 'error',
            error_at: new Date(),
          }
    )

    Log.info(`ripper complete ripped=${this.ripped}/${entries.length}`)

    return {
      media_id: data.media_id,
      download,
      ripped: this.ripped,
      total: entries.length,
      title: data.title,
      year: data.year,
    }
  }

  private async ripEntries(
    entries: RipperEntry[],
    downloadId: number,
    mediaId: string,
    concurrency: number
  ) {
    const tmpPath = join(tmpdir(), `omnarr-dl-${mediaId}`)

    await mkdir(tmpPath, { recursive: true })

    await using _ = {
      [Symbol.asyncDispose]: async () => {
        await rm(tmpPath, { recursive: true }).catch((err) =>
          Log.warn(`failed to cleanup temp dir path=${tmpPath} error=${err}`)
        )
      },
    }

    const queue = new PQueue({ concurrency })

    this.onProgress('Ripping', `0/${entries.length}`, 0)

    for (const entry of entries) {
      queue.add(() =>
        this.ripEntry(entry, tmpPath)
          .then(() => {
            this.ripped++
          })
          .catch((err) =>
            Log.warn(
              `ripper failed tag=${entry.tag} error="${err instanceof Error ? err.message : String(err)}"`
            )
          )
          .then(async () => {
            this.completed++

            this.onProgress(
              'Ripping',
              `${this.completed}/${entries.length}`,
              this.completed / entries.length
            )

            await DbDownloads.update(downloadId, {
              progress: this.completed / entries.length,
            })
          })
      )
    }

    await queue.onIdle()

    this.onProgress(`Ripped ${this.ripped}/${entries.length}`, 'completed', 1)
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

  private async gatherEntries(
    data: DownloadData,
    tracksDir: string,
    concurrency: number
  ) {
    const units = await this.resolveUnits(data, tracksDir)

    const entries: RipperEntry[] = []

    let gathered = 0

    const queue = new PQueue({ concurrency })

    for (const unit of units) {
      queue.add(() =>
        this.gatherUnit(data, unit, entries)
          .catch((err) =>
            Log.warn(
              `ripper failed unit=${unit.tag || 'movie'} error="${err instanceof Error ? err.message : String(err)}"`
            )
          )
          .then(() => {
            gathered++

            this.onProgress(
              'Gathering',
              `${gathered}/${units.length} episodes`,
              gathered / units.length
            )
          })
      )
    }

    await queue.onIdle()

    return entries
  }

  private async gatherUnit(
    data: DownloadData,
    unit: RipperUnit,
    entries: RipperEntry[]
  ) {
    const streams = await this.client.getStreams(data.imdb_id, unit.episode)

    if (!data.audio_only && streams.video) {
      entries.push({
        tag: unit.tag ? `${unit.tag} VIDEO` : 'VIDEO',
        stream: streams.video,
        outputPath: join(unit.dir, 'video.mkv'),
        codec: 'v',
      })
    }

    const audioStreams = data.lang
      ? streams.audio.filter((s) => s.lang === data.lang)
      : streams.audio

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

  private async resolveUnits(data: DownloadData, tracksDir: string) {
    if (data.season_number == null) {
      return [{ tag: '', dir: tracksDir }] satisfies RipperUnit[]
    }

    const episodes = await this.client.getEpisodeList(
      data.imdb_id,
      data.season_number
    )

    return episodes.map((ep) => {
      const seTag = `S${String(data.season_number!).padStart(2, '0')}E${String(ep.epi_num).padStart(2, '0')}`

      return {
        tag: seTag,
        dir: join(tracksDir, seTag.toLowerCase()),
        episode: { season: data.season_number!, episode: ep.epi_num },
      }
    })
  }
}
