import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'
import { unzipSync } from 'fflate'
import axios from 'redaxios'

import { config } from '@/config'
import { type indexer_source, media_type } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import type { DownloadClient } from '@/integrations/download-client'
import { indexerMap } from '@/integrations/indexers/registry'
import { SuperflixAdapter } from '@/integrations/indexers/superflix'
import { QBittorrentClient } from '@/integrations/qbittorrent/client'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Log } from '@/log'
import { deriveId } from '@/utils'

export class Downloads {
  private client: DownloadClient | null

  constructor() {
    this.client = config.download_client
      ? new QBittorrentClient(config.download_client)
      : null
  }

  async add(
    params: {
      tmdb_id: number
      source_id: string
      download_url: string
      type: media_type
      indexer_source: indexer_source
      audio_only?: boolean
      language?: string | null
    },
    onProgress: (tag: string, status: string, progress: number) => void
  ) {
    const details = await new TmdbClient().getDetails(
      params.tmdb_id,
      params.type
    )

    const tmdbMedia = await DbTmdbMedia.upsert({
      tmdb_id: details.tmdb_id,
      media_type: details.media_type,
      title: details.title,
      year: details.year,
      overview: details.overview,
      poster_path: details.poster_path,
      imdb_id: details.imdb_id,
    })

    const rootFolder = config.root_folders?.[details.media_type]

    if (!rootFolder) {
      throw new Error(`No root folder configured for ${details.media_type}`)
    }

    const media = await DbMedia.create({
      id: deriveId(`${details.tmdb_id}:${details.media_type}`),
      tmdb_media_id: tmdbMedia.id,
      media_type: details.media_type,
      root_folder: rootFolder,
    })

    const source = indexerMap[params.indexer_source].source

    switch (source) {
      case 'subtitle':
        return await this.addSubtitle(
          {
            source_id: params.source_id,
            download_url: params.download_url,
            language: params.language,
            media,
          },
          onProgress,
          { title: details.title, year: details.year }
        )

      case 'ripper':
        return await this.addRipper(
          {
            download_url: params.download_url,
            imdb_id: details.imdb_id,
            source_id: params.source_id,
            audio_only: params.audio_only,
            title: details.title,
            year: details.year,
            media,
          },
          onProgress
        )

      case 'torrent':
        return await this.addTorrent(
          {
            source_id: params.source_id,
            download_url: params.download_url,
            media,
          },
          { title: details.title, year: details.year }
        )
    }
  }

  private async addTorrent(
    data: {
      source_id: string
      download_url: string
      media: {
        id: string
        media_type: media_type
        root_folder: string
        tmdb_media_id: number
        added_at: Date
      }
    },
    details: { title: string; year: number | null }
  ) {
    if (!this.client) {
      throw new Error('No download client configured.')
    }

    Log.info(
      `adding torrent source_id=${data.source_id} title="${details.title}"`
    )

    await this.client.addTorrent({ url: data.download_url })

    const download = await DbDownloads.create({
      media_id: data.media.id,
      source_id: data.source_id,
      download_url: data.download_url,
    })

    Log.info(`torrent sent to client source_id=${data.source_id}`)

    return { media: data.media, download, ...details }
  }

  private async addRipper(
    data: {
      source_id: string
      imdb_id: string
      download_url: string
      audio_only?: boolean
      title: string
      year: number | null
      media: {
        added_at: Date
        id: string
        media_type: media_type
        root_folder: string
        tmdb_media_id: number
      }
    },
    onProgress: (tag: string, status: string, progress: number) => void
  ) {
    Log.info(
      `ripper start imdb=${data.imdb_id} title="${data.title}" audio_only=${!!data.audio_only}`
    )

    const client = new SuperflixAdapter()
    const streams = await client.getStreams(data.imdb_id)

    const tracksDir = this.resolveTracksDir(data.media.id)

    const entries: {
      tag: string
      stream: { url: string; referer: string }
      outputPath: string
      codec: 'v' | 'a'
    }[] = []

    if (!data.audio_only && streams.video) {
      entries.push({
        tag: 'VIDEO',
        stream: streams.video,
        outputPath: join(tracksDir, 'video.mkv'),
        codec: 'v',
      })
    }

    for (let i = 0; i < streams.audio.length; i++) {
      const s = streams.audio[i]
      const label = s.lang ?? String(i)

      entries.push({
        tag: label.toUpperCase(),
        stream: s,
        outputPath: join(tracksDir, `audio_${label}.mka`),
        codec: 'a',
      })
    }

    const download = await DbDownloads.create({
      media_id: data.media.id,
      source_id: data.source_id,
      download_url: data.download_url,
      source: 'ripper',
      status: 'downloading',
    })

    const tmpPath = join(tmpdir(), `omnarr-dl-${data.media.id}`)

    await mkdir(tmpPath, { recursive: true })

    await using _ = {
      [Symbol.asyncDispose]: async () => {
        await rm(tmpPath, { recursive: true }).catch(() => {})
      },
    }

    let ripped = 0

    for (const entry of entries) {
      try {
        onProgress(entry.tag, 'downloading', 0)

        const tmpFile = join(tmpPath, `${entry.tag}.ts`)

        await client.downloadStream(
          entry.stream,
          tmpFile,
          async (downloaded, total) => {
            const streamProgress = downloaded / total
            const overall = (ripped + streamProgress) / entries.length

            await DbDownloads.update(download.id, { progress: overall })
            onProgress(entry.tag, 'downloading', streamProgress)
          }
        )

        onProgress(entry.tag, 'processing', 1)

        await mkdir(dirname(entry.outputPath), { recursive: true })

        await new FFmpegBuilder({ overwrite: true })
          .input(tmpFile)
          .codec(entry.codec, 'copy')
          .output(entry.outputPath)
          .run()

        onProgress(entry.tag, 'completed', 1)
        ripped++
      } catch (err) {
        Log.warn(
          `ripper failed tag=${entry.tag} error="${err instanceof Error ? err.message : String(err)}"`
        )
      }
    }

    if (ripped > 0) {
      await DbDownloads.update(download.id, {
        status: 'completed',
        progress: 1,
        content_path: tracksDir,
      })
    } else {
      await DbDownloads.update(download.id, {
        status: 'error',
        error_at: new Date().toISOString(),
      })
    }

    Log.info(`ripper complete ripped=${ripped} total=${entries.length}`)

    return {
      media: data.media,
      download,
      ripped,
      total: entries.length,
      title: data.title,
      year: data.year,
    }
  }

  private async addSubtitle(
    data: {
      source_id: string
      download_url: string
      language?: string | null
      media: {
        id: string
        media_type: media_type
        root_folder: string
        tmdb_media_id: number
        added_at: Date
      }
    },
    onProgress: (tag: string, status: string, progress: number) => void,
    details: { title: string; year: number | null }
  ) {
    const tracksDir = this.resolveTracksDir(data.media.id)
    const lang = data.language?.toLowerCase() ?? 'und'
    const tag = lang.toUpperCase()

    await mkdir(tracksDir, { recursive: true })

    const download = await DbDownloads.create({
      media_id: data.media.id,
      source_id: data.source_id,
      download_url: data.download_url,
      source: 'subtitle',
      status: 'downloading',
    })

    onProgress(tag, 'downloading', 0)

    try {
      const { data: zipData } = await axios<ArrayBuffer>({
        url: data.download_url,
        responseType: 'arrayBuffer',
      })

      const files = unzipSync(new Uint8Array(zipData))
      const srtEntry = Object.keys(files).find((f) => f.endsWith('.srt'))

      if (!srtEntry) {
        throw new Error('No .srt file found in subtitle archive')
      }

      const sourceHash = deriveId(data.source_id)
      const targetPath = join(tracksDir, `sub_${lang}_${sourceHash}.srt`)

      await Bun.write(targetPath, files[srtEntry])

      await DbDownloads.update(download.id, {
        status: 'completed',
        progress: 1,
        content_path: targetPath,
      })

      onProgress(tag, 'completed', 1)

      Log.info(`subtitle saved path=${targetPath}`)

      return { media: data.media, download, ...details }
    } catch (err) {
      await DbDownloads.update(download.id, {
        status: 'error',
        error_at: new Date().toISOString(),
      }).catch(() => {})

      throw err
    }
  }

  private resolveTracksDir(mediaId: string) {
    const tracksRoot = config.root_folders?.tracks

    if (!tracksRoot) {
      throw new Error('No tracks root folder configured')
    }

    return join(tracksRoot, mediaId)
  }

  async getBySourceId(sourceId: string) {
    if (this.client) {
      await this.syncDownloads(this.client)
    }

    return await DbDownloads.getBySourceId(sourceId)
  }

  async list(limit: number) {
    if (this.client) {
      await this.syncDownloads(this.client)
    }

    return await DbDownloads.list(limit)
  }

  private async syncDownloads(client: DownloadClient) {
    Log.info('sync started')

    const [active, statuses] = await Promise.all([
      DbDownloads.listActive(),
      client.getTorrentStatuses(),
    ])

    const statusByHash = new Map(statuses.map((s) => [s.hash.toUpperCase(), s]))
    const now = new Date().toISOString()

    const updates = active.map((d) => {
      const s = statusByHash.get(d.source_id)
      const status = s ? (s.progress >= 1 ? 'completed' : s.status) : 'error'

      if (status === 'error' && !d.error_at) {
        Log.warn(`download entered error status source_id=${d.source_id}`)
      } else if (status !== 'error' && d.error_at) {
        Log.info(`download exited error status source_id=${d.source_id}`)
      }

      return {
        id: d.id,
        media_id: d.media_id,
        source_id: d.source_id,
        download_url: d.download_url,
        progress: s?.progress ?? d.progress,
        speed: s?.speed ?? 0,
        eta: s?.eta ?? 0,
        status,
        content_path: s?.content_path ?? d.content_path,
        error_at: status === 'error' ? (d.error_at ?? now) : null,
      }
    })

    const updatedCount = await DbDownloads.batchUpdate(updates)

    const deleted = await DbDownloads.deleteStaleErrors()

    if (deleted > 0) {
      Log.info(`stale errors deleted count=${deleted}`)
    }

    Log.info(`sync complete active=${active.length} updated=${updatedCount}`)
  }
}
