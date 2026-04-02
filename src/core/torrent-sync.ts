import { DbDownloads } from '@/db/downloads'
import type { DownloadClient } from '@/integrations/download-client'
import { QBittorrentClient } from '@/integrations/qbittorrent/client'
import { config } from '@/lib/config'
import { Log } from '@/lib/log'

export class TorrentSync {
  private client: DownloadClient | null

  constructor() {
    this.client = config.download_client
      ? new QBittorrentClient(config.download_client)
      : null
  }

  async sync() {
    if (!this.client) {
      return
    }

    Log.info('sync started')

    const [active, statuses] = await Promise.all([
      DbDownloads.listActive(),
      this.client.getTorrentStatuses(),
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
