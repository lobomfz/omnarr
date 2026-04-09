import type { QueryClient } from '@tanstack/react-query'

import type { download_status } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { deriveId } from '@/lib/utils'
import { orpcWs } from '@/web/client'

import { TestSeed } from '../../../helpers/seed'
import { QBittorrentMock } from '../../../mocks/qbittorrent'
import { waitFor } from '../../testing-library'

export async function seedDownload(opts: {
  tmdbId: number
  title: string
  sourceId: string
  progress?: number
  status?: download_status
}) {
  const mediaId = deriveId(`${opts.tmdbId}:movie`)

  await TestSeed.library.movie({
    tmdbId: opts.tmdbId,
    title: opts.title,
    year: 1999,
    imdbId: `tt${String(opts.tmdbId).padStart(7, '0')}`,
  })

  const download = await DbDownloads.create({
    media_id: mediaId,
    source_id: opts.sourceId,
    download_url: `https://beyond-hd.me/dl/${opts.sourceId.toLowerCase()}`,
    source: 'torrent',
    status: opts.status ?? 'downloading',
    progress: opts.progress ?? 0,
  })

  await QBittorrentMock.db
    .insertInto('torrents')
    .values({
      hash: opts.sourceId.toLowerCase(),
      url: `https://beyond-hd.me/dl/${opts.sourceId.toLowerCase()}`,
      savepath: '',
      category: 'omnarr',
      progress: opts.progress ?? 0,
      dlspeed: 0,
      eta: 0,
      state: 'downloading',
      content_path: `/${opts.sourceId.toLowerCase()}`,
    })
    .execute()

  return { mediaId, downloadId: download.id }
}

export async function seedRipperDownload(opts: {
  mediaId: string
  sourceId: string
  progress?: number
  status?: download_status
  speed?: number
  seasonNumber?: number | null
  episodeNumber?: number | null
}) {
  const download = await DbDownloads.create({
    media_id: opts.mediaId,
    source_id: opts.sourceId,
    download_url: `imdb:${opts.sourceId}`,
    source: 'ripper',
    status: opts.status ?? 'pending',
    progress: opts.progress ?? 0,
    speed: opts.speed ?? 0,
    season_number: opts.seasonNumber,
    episode_number: opts.episodeNumber,
  })

  return { downloadId: download.id }
}

export async function waitForDownloadProgressStream(queryClient: QueryClient) {
  await waitFor(
    () => {
      if (
        queryClient.getQueryData(
          orpcWs.downloadProgress.experimental_streamedOptions({}).queryKey
        ) === undefined
      ) {
        throw new Error('download progress stream not ready')
      }
    },
    { timeout: 5000 }
  )
}
