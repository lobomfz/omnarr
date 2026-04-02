import { DbDownloads } from '@/db/downloads'
import { QBittorrentClient } from '@/integrations/qbittorrent/client'
import { config } from '@/lib/config'
import { Log } from '@/lib/log'

import type { DownloadSource, DownloadData } from './types/download-source'

export class TorrentDownload implements DownloadSource {
  constructor(public onProgress: DownloadSource['onProgress']) {}

  add: DownloadSource['add'] = async (data: DownloadData) => {
    if (!config.download_client) {
      throw new Error('No download client configured.')
    }

    Log.info(`adding torrent source_id=${data.source_id} title="${data.title}"`)

    await new QBittorrentClient(config.download_client).addTorrent({
      url: data.download_url,
    })

    const download = await DbDownloads.create({
      media_id: data.media_id,
      source_id: data.source_id,
      download_url: data.download_url,
    })

    Log.info(`torrent sent to client source_id=${data.source_id}`)

    return {
      media_id: data.media_id,
      download,
      title: data.title,
      year: data.year,
    }
  }
}
