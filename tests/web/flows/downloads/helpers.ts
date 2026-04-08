import type { download_status } from '@/db/connection'
import { database } from '@/db/connection'
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import { DbSearchResults } from '@/db/search-results'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { scanQueue } from '@/jobs/queues'
import { deriveId } from '@/lib/utils'

import { QBittorrentMock } from '../../../mocks/qbittorrent'

export async function seedMatrixInLibrary() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    year: 1999,
    imdb_id: 'tt0133093',
  })

  return await DbMedia.create({
    id: deriveId('603:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/tmp/omnarr-test-movies',
  })
}

export async function seedDownload(opts: {
  tmdbId: number
  title: string
  sourceId: string
  progress?: number
  status?: download_status
}) {
  const mediaId = deriveId(`${opts.tmdbId}:movie`)

  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: opts.tmdbId,
    media_type: 'movie',
    title: opts.title,
    year: 1999,
    imdb_id: `tt${String(opts.tmdbId).padStart(7, '0')}`,
  })

  await DbMedia.create({
    id: mediaId,
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/tmp/omnarr-test-movies',
  })

  const download = await database.kysely
    .insertInto('downloads')
    .values({
      media_id: mediaId,
      source_id: opts.sourceId,
      download_url: `https://beyond-hd.me/dl/${opts.sourceId.toLowerCase()}`,
      source: 'torrent',
      status: opts.status ?? 'downloading',
      progress: opts.progress ?? 0,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

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

export async function seedMatrixSearchResult() {
  const [row] = await DbSearchResults.upsert([
    {
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      year: 1999,
    },
  ])

  return row.id
}

export async function seedBreakingBadInLibrary() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 1399,
    media_type: 'tv',
    title: 'Breaking Bad',
    year: 2008,
    imdb_id: 'tt0903747',
  })

  const media = await DbMedia.create({
    id: deriveId('1399:tv'),
    tmdb_media_id: tmdb.id,
    media_type: 'tv',
    root_folder: '/tmp/omnarr-test-tv',
  })

  const [season] = await DbSeasons.upsert([
    {
      tmdb_media_id: tmdb.id,
      season_number: 1,
      title: 'Season 1',
      episode_count: 3,
    },
  ])

  await DbEpisodes.upsert([
    { season_id: season.id, episode_number: 1, title: 'Pilot' },
    { season_id: season.id, episode_number: 2, title: "Cat's in the Bag..." },
    {
      season_id: season.id,
      episode_number: 3,
      title: "...And the Bag's in the River",
    },
  ])

  return media
}

export async function seedBreakingBadNoEpisodes() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 1399,
    media_type: 'tv',
    title: 'Breaking Bad',
    year: 2008,
    imdb_id: 'tt0903747',
  })

  const media = await DbMedia.create({
    id: deriveId('1399:tv'),
    tmdb_media_id: tmdb.id,
    media_type: 'tv',
    root_folder: '/tmp/omnarr-test-tv',
  })

  await DbSeasons.upsert([
    {
      tmdb_media_id: tmdb.id,
      season_number: 1,
      title: 'Season 1',
      episode_count: 3,
    },
  ])

  return media
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
  const download = await database.kysely
    .insertInto('downloads')
    .values({
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
    .returning(['id'])
    .executeTakeFirstOrThrow()

  return { downloadId: download.id }
}

export function resetDownloadState() {
  database.reset('events')
  database.reset('media_files')
  database.reset('downloads')
  database.reset('media')
  database.reset('tmdb_media')
  database.reset('releases')
  database.reset('search_results')
  QBittorrentMock.reset()
  scanQueue.clear()
}
