import { config } from '@/config'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import type { DownloadClient } from '@/integrations/download-client'
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

  async add(params: {
    tmdb_id: number
    info_hash: string
    download_url: string
    type: 'movie' | 'tv'
  }) {
    if (!this.client) {
      throw new Error('No download client configured.')
    }

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

    await Log.info(
      `adding torrent info_hash=${params.info_hash} title="${details.title}"`
    )

    await this.client.addTorrent({ url: params.download_url })

    const download = await DbDownloads.create({
      media_id: media.id,
      info_hash: params.info_hash,
      download_url: params.download_url,
    })

    await Log.info(`torrent sent to client info_hash=${params.info_hash}`)

    return { media, download, title: details.title, year: details.year }
  }

  async getByInfoHash(infoHash: string) {
    if (this.client) {
      await this.syncDownloads(this.client)
    }

    return await DbDownloads.getByInfoHash(infoHash)
  }

  async list(limit: number) {
    if (this.client) {
      await this.syncDownloads(this.client)
    }

    return await DbDownloads.list(limit)
  }

  private async syncDownloads(client: DownloadClient) {
    await Log.info('sync started')

    const [active, statuses] = await Promise.all([
      DbDownloads.listActive(),
      client.getTorrentStatuses(),
    ])

    const statusByHash = new Map(statuses.map((s) => [s.hash, s]))
    const now = new Date().toISOString()

    const updates = await Promise.all(
      active.map(async (d) => {
        const s = statusByHash.get(d.info_hash)
        const status = s ? (s.progress >= 1 ? 'completed' : s.status) : 'error'

        if (status === 'error' && !d.error_at) {
          await Log.warn(
            `download entered error status info_hash=${d.info_hash}`
          )
        } else if (d.error_at) {
          await Log.info(
            `download exited error status info_hash=${d.info_hash}`
          )
        }

        return {
          id: d.id,
          media_id: d.media_id,
          info_hash: d.info_hash,
          download_url: d.download_url,
          progress: s?.progress ?? d.progress,
          speed: s?.speed ?? 0,
          eta: s?.eta ?? 0,
          status,
          content_path: s?.content_path ?? d.content_path,
          error_at: status === 'error' ? (d.error_at ?? now) : null,
        }
      })
    )

    const updatedCount = await DbDownloads.batchUpdate(updates)

    const deleted = await DbDownloads.deleteStaleErrors()

    if (deleted > 0) {
      await Log.info(`stale errors deleted count=${deleted}`)
    }

    await Log.info(
      `sync complete active=${active.length} updated=${updatedCount}`
    )
  }
}
