import { mkdir } from 'fs/promises'
import { join } from 'path'

import { unzipSync } from 'fflate'
import axios from 'redaxios'

import { DbDownloads } from '@/db/downloads'
import { Log } from '@/lib/log'
import { Parsers } from '@/lib/parsers'
import { deriveId } from '@/lib/utils'

import type { DownloadSource, DownloadData } from './types/download-source'

export class SubtitleDownload implements DownloadSource {
  constructor(public onProgress: DownloadSource['onProgress']) {}

  add: DownloadSource['add'] = async (data: DownloadData) => {
    const lang = data.language?.toLowerCase() ?? 'und'
    const tag = lang.toUpperCase()
    const sourceHash = deriveId(data.source_id)

    const targetDir = this.getTargetDir(data)

    await mkdir(targetDir, { recursive: true })

    const download = await DbDownloads.create({
      media_id: data.media_id,
      source_id: data.source_id,
      download_url: data.download_url,
      source: 'subtitle',
      status: 'downloading',
    })

    this.onProgress(tag, 'downloading', 0)

    const contentPath = await this.processArchive(
      data,
      targetDir,
      lang,
      sourceHash
    ).catch(async (err) => {
      await DbDownloads.update(download.id, {
        status: 'error',
        error_at: new Date(),
      }).catch((err) =>
        Log.warn(
          `failed to update download status id=${download.id} error=${err}`
        )
      )

      throw err
    })

    await DbDownloads.update(download.id, {
      status: 'completed',
      progress: 1,
      content_path: contentPath,
    })

    this.onProgress(tag, 'completed', 1)

    return {
      media_id: data.media_id,
      download,
      title: data.title,
      year: data.year,
    }
  }

  private getTargetDir(data: DownloadData) {
    if (data.season_number != null && data.episode_number != null) {
      return join(
        data.tracksDir,
        `s${String(data.season_number).padStart(2, '0')}e${String(data.episode_number).padStart(2, '0')}`
      )
    }

    return data.tracksDir
  }

  private async processArchive(
    data: DownloadData,
    targetDir: string,
    lang: string,
    sourceHash: string
  ) {
    const files = await this.fetchAndExtract(data.download_url)
    const isSeasonPack =
      data.season_number != null && data.episode_number == null

    if (isSeasonPack) {
      await this.saveSeasonPack(files, data.tracksDir, lang, sourceHash)
      return data.tracksDir
    }

    const srtEntries = Object.keys(files).filter((f) => f.endsWith('.srt'))

    if (srtEntries.length === 0) {
      throw new Error('No .srt file found in subtitle archive')
    }

    const targetPath = join(targetDir, `sub_${lang}_${sourceHash}.srt`)

    await Bun.write(targetPath, files[srtEntries[0]])

    Log.info(`subtitle saved path=${targetPath}`)

    return targetPath
  }

  private async fetchAndExtract(url: string) {
    const { data } = await axios<ArrayBuffer>({
      url,
      responseType: 'arrayBuffer',
    })

    return unzipSync(new Uint8Array(data))
  }

  private async saveSeasonPack(
    files: Record<string, Uint8Array>,
    tracksDir: string,
    lang: string,
    sourceHash: string
  ) {
    const srtEntries = Object.keys(files).filter((f) => f.endsWith('.srt'))

    if (srtEntries.length === 0) {
      throw new Error('No .srt file found in subtitle archive')
    }

    let saved = 0

    for (const entry of srtEntries) {
      const parsed = Parsers.seasonEpisode(entry)

      if (parsed.season_number === null || parsed.episode_number === null) {
        Log.warn(`season pack: skipping "${entry}" (no episode pattern)`)
        continue
      }

      const epDir = join(
        tracksDir,
        `s${String(parsed.season_number).padStart(2, '0')}e${String(parsed.episode_number).padStart(2, '0')}`
      )

      await mkdir(epDir, { recursive: true })
      await Bun.write(
        join(epDir, `sub_${lang}_${sourceHash}.srt`),
        files[entry]
      )

      saved++
    }

    if (saved === 0) {
      throw new Error(
        'Season pack contained no .srt files with episode patterns'
      )
    }

    Log.info(`season pack saved=${saved}/${srtEntries.length} dir=${tracksDir}`)
  }
}
