import { mkdir } from 'fs/promises'
import { join } from 'path'

import { unzipSync } from 'fflate'
import axios from 'redaxios'

import type { DownloadData, DownloadSource } from '@/core/types/download-source'
import { DbDownloads } from '@/db/downloads'
import { Formatters } from '@/lib/formatters'
import { Log } from '@/lib/log'
import { Parsers } from '@/lib/parsers'
import { deriveId } from '@/lib/utils'

export class SubtitleDownload implements DownloadSource {
  private async fetchSrtEntries(url: string) {
    const { data } = await axios<ArrayBuffer>({
      url,
      responseType: 'arrayBuffer',
    })

    const files = unzipSync(new Uint8Array(data))
    const srtEntries = Object.keys(files).filter((f) => f.endsWith('.srt'))

    return { files, srtEntries }
  }

  async download(input: {
    source_id: string
    download_url: string
    media_id: string
    tracks_dir: string
    language?: string | null
    season_number?: number | null
    episode_number?: number | null
  }) {
    const lang = input.language?.toLowerCase() ?? 'und'
    const sourceHash = deriveId(input.source_id)
    const targetDir = this.resolveTargetDir(
      input.tracks_dir,
      input.season_number,
      input.episode_number
    )

    await mkdir(targetDir, { recursive: true })

    const download = await DbDownloads.create({
      media_id: input.media_id,
      source_id: input.source_id,
      download_url: input.download_url,
      source: 'subtitle',
      status: 'downloading',
    })

    try {
      const { files, srtEntries } = await this.fetchSrtEntries(
        input.download_url
      )

      if (srtEntries.length === 0) {
        await DbDownloads.update(download.id, {
          status: 'error',
          error_at: new Date().toISOString(),
        })

        return null
      }

      const targetPath = join(targetDir, `sub_${lang}_${sourceHash}.srt`)

      await Bun.write(targetPath, files[srtEntries[0]])

      await DbDownloads.update(download.id, {
        status: 'completed',
        progress: 1,
        content_path: targetPath,
      })

      Log.info(
        `subtitle downloaded source_id=${input.source_id} path=${targetPath}`
      )

      return { path: targetPath, download_id: download.id }
    } catch (err: any) {
      await DbDownloads.update(download.id, {
        status: 'error',
        error_at: new Date().toISOString(),
      }).catch((updateErr) =>
        Log.warn(
          `failed to update download status id=${download.id} error=${updateErr}`
        )
      )

      Log.warn(
        `subtitle download failed source_id=${input.source_id} error="${err.message}"`
      )

      throw err
    }
  }

  enqueue: DownloadSource['enqueue'] = async (data) => {
    const isSeasonPack =
      data.season_number != null && data.episode_number == null

    if (isSeasonPack) {
      return await this.enqueueSeasonPack(data)
    }

    const result = await this.download({
      source_id: data.source_id,
      download_url: data.download_url,
      media_id: data.media_id,
      tracks_dir: data.tracks_dir,
      language: data.language,
      season_number: data.season_number,
      episode_number: data.episode_number,
    })

    if (!result) {
      throw new Error('No .srt file found in subtitle archive')
    }

    return {
      media_id: data.media_id,
      download_id: result.download_id,
      title: data.title,
      year: data.year,
    }
  }

  private async enqueueSeasonPack(data: DownloadData) {
    const lang = data.language?.toLowerCase() ?? 'und'
    const sourceHash = deriveId(data.source_id)

    const download = await DbDownloads.create({
      media_id: data.media_id,
      source_id: data.source_id,
      download_url: data.download_url,
      source: 'subtitle',
      status: 'downloading',
    })

    try {
      const { files, srtEntries } = await this.fetchSrtEntries(
        data.download_url
      )

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
          data.tracks_dir,
          Formatters.seasonEpisodeTag(
            parsed.season_number,
            parsed.episode_number
          ).toLowerCase()
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

      Log.info(
        `season pack saved=${saved}/${srtEntries.length} dir=${data.tracks_dir}`
      )

      await DbDownloads.update(download.id, {
        status: 'completed',
        progress: 1,
        content_path: data.tracks_dir,
      })

      return {
        media_id: data.media_id,
        download_id: download.id,
        title: data.title,
        year: data.year,
      }
    } catch (err: any) {
      await DbDownloads.update(download.id, {
        status: 'error',
        error_at: new Date().toISOString(),
      }).catch((updateErr) =>
        Log.warn(
          `failed to update download status id=${download.id} error=${updateErr}`
        )
      )

      throw err
    }
  }

  private resolveTargetDir(
    tracks_dir: string,
    seasonNumber?: number | null,
    episodeNumber?: number | null
  ) {
    if (seasonNumber != null && episodeNumber != null) {
      return join(
        tracks_dir,
        Formatters.seasonEpisodeTag(seasonNumber, episodeNumber).toLowerCase()
      )
    }

    return tracks_dir
  }
}
