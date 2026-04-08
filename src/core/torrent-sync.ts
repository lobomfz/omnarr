import { DownloadEvents } from '@/core/download-events'
import { DbDownloads } from '@/db/downloads'
import { DbEvents } from '@/db/events'
import { QBittorrentClient } from '@/integrations/qbittorrent/client'
import { Scheduler } from '@/jobs/scheduler'
import { config } from '@/lib/config'
import { Log } from '@/lib/log'

export class TorrentSync {
  private client: QBittorrentClient | null
  private syncFailed = false

  constructor() {
    this.client = config.download_client
      ? new QBittorrentClient(config.download_client)
      : null
  }

  async sync() {
    if (!this.client) {
      return { updated: 0, completed: [] }
    }

    const deleted = await DbDownloads.deleteStaleErrors()

    if (deleted > 0) {
      Log.info(`stale errors deleted count=${deleted}`)
    }

    const active = await DbDownloads.listForSync()

    if (active.length === 0) {
      Log.info('sync no-op: no active downloads')
      return { updated: 0, completed: [] }
    }

    const statuses = await this.fetchStatuses()

    if (this.syncFailed) {
      await this.handleSyncRecovery()
    }

    const statusByHash = new Map(statuses.map((s) => [s.hash.toUpperCase(), s]))
    const now = new Date().toISOString()

    const completedMediaIds: string[] = []
    const errorTransitions: { media_id: string; source_id: string }[] = []

    const updates = active.map((d) => {
      const s = statusByHash.get(d.source_id)
      const status = s ? (s.progress >= 1 ? 'completed' : s.status) : 'error'

      if (status === 'completed') {
        completedMediaIds.push(d.media_id)
      }

      if (status === 'error' && !d.error_at) {
        Log.warn(`download entered error status source_id=${d.source_id}`)
        errorTransitions.push({
          media_id: d.media_id,
          source_id: d.source_id,
        })
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

    await DbEvents.createBatch(
      errorTransitions.map((t) => ({
        media_id: t.media_id,
        entity_type: 'download' as const,
        entity_id: t.source_id,
        event_type: 'error' as const,
        message: 'Torrent removed from client',
      }))
    )

    await DownloadEvents.publishMany(updates.map((u) => u.id))

    for (const mediaId of completedMediaIds) {
      Scheduler.scan(mediaId)
    }

    Log.info(`sync complete active=${active.length} updated=${updatedCount}`)

    return { updated: updatedCount, completed: completedMediaIds }
  }

  private async fetchStatuses() {
    return await this.client!.getTorrentStatuses().catch(async (err) => {
      await this.handleSyncError(err)
      throw err
    })
  }

  private async handleSyncError(err: any) {
    if (this.syncFailed) {
      return
    }

    this.syncFailed = true

    const message = err.message

    Log.warn(`sync failed (first error): ${message}`)

    await DbEvents.create({
      entity_type: 'sync',
      entity_id: 'torrent-sync',
      event_type: 'error',
      message,
    })
  }

  private async handleSyncRecovery() {
    this.syncFailed = false

    Log.info('sync recovered')

    await DbEvents.create({
      entity_type: 'sync',
      entity_id: 'torrent-sync',
      event_type: 'recovered',
      message: 'Torrent sync reconnected',
    })
  }
}
