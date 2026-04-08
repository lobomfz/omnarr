import { DownloadEvents } from '@/core/download-events'
import type { DownloadSource } from '@/core/types/download-source'
import { DbDownloads } from '@/db/downloads'
import { DbEvents } from '@/db/events'
import { QBittorrentClient } from '@/integrations/qbittorrent/client'
import { config } from '@/lib/config'
import { Log } from '@/lib/log'
import { OmnarrError } from '@/shared/errors'

export class TorrentDownload implements DownloadSource {
  enqueue: DownloadSource['enqueue'] = async (data) => {
    if (!config.download_client) {
      throw new OmnarrError('NO_DOWNLOAD_CLIENT')
    }

    Log.info(`adding torrent source_id=${data.source_id} title="${data.title}"`)

    await new QBittorrentClient(config.download_client)
      .addTorrent({
        url: data.download_url,
      })
      .catch((err) => {
        Log.warn(
          `download failed source_id=${data.source_id} error="${err.code ?? err.message}"`
        )

        throw err
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

    await DownloadEvents.publish(download.id)

    Log.info(`torrent sent source_id=${data.source_id}`)

    return {
      media_id: data.media_id,
      download_id: download.id,
      title: data.title,
      year: data.year,
    }
  }
}
