import { DbDownloads } from '@/db/downloads'
import { DbEvents } from '@/db/events'
import { QBittorrentClient } from '@/integrations/qbittorrent/client'
import { config } from '@/lib/config'
import { Log } from '@/lib/log'

import type { DownloadSource } from './types/download-source'

export class TorrentDownload implements DownloadSource {
  enqueue: DownloadSource['enqueue'] = async (data) => {
    if (!config.download_client) {
      throw new Error('No download client configured.')
    }

    Log.info(`adding torrent source_id=${data.source_id} title="${data.title}"`)

    await new QBittorrentClient(config.download_client)
      .addTorrent({
        url: data.download_url,
      })
      .catch(async (err) => {
        Log.warn(
          `download failed source_id=${data.source_id} error="${err.message}"`
        )

        await DbEvents.create({
          media_id: data.media_id,
          entity_type: 'download',
          entity_id: data.source_id,
          event_type: 'error',
          message: err.message,
        })

        throw new Error(err.message, { cause: err })
      })

    const download = await DbDownloads.create({
      media_id: data.media_id,
      source_id: data.source_id,
      download_url: data.download_url,
    })

    await DbEvents.create({
      media_id: data.media_id,
      entity_type: 'download',
      entity_id: data.source_id,
      event_type: 'created',
      message: `Download started: ${data.title}`,
    })

    Log.info(`torrent sent source_id=${data.source_id}`)

    return {
      media_id: data.media_id,
      download_id: download.id,
      title: data.title,
      year: data.year,
    }
  }
}
