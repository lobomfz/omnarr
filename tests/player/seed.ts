import type { Insertable } from '@lobomfz/db'

import { type DB } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/utils'

export async function seedMedia() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    year: 1999,
  })

  return await DbMedia.create({
    id: deriveId('603:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/movies',
  })
}

export async function seedTvMedia() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 1396,
    media_type: 'tv',
    title: 'Breaking Bad',
    year: 2008,
  })

  const media = await DbMedia.create({
    id: deriveId('1396:tv'),
    tmdb_media_id: tmdb.id,
    media_type: 'tv',
    root_folder: '/tv',
  })

  const seasons = await DbSeasons.upsert([
    {
      tmdb_media_id: tmdb.id,
      season_number: 1,
      title: 'Season 1',
      episode_count: 3,
    },
  ])

  const episodes = await DbEpisodes.upsert([
    { season_id: seasons[0].id, episode_number: 1, title: 'Pilot' },
    {
      season_id: seasons[0].id,
      episode_number: 2,
      title: "Cat's in the Bag...",
    },
    {
      season_id: seasons[0].id,
      episode_number: 3,
      title: "...And the Bag's in the River",
    },
  ])

  return { media, episodes }
}

export async function seedDownloadWithTracks(
  mediaId: string,
  infoHash: string,
  filePath: string,
  tracks: Omit<Insertable<DB['media_tracks']>, 'media_file_id'>[],
  opts?: { duration?: number; keyframes?: number[]; episode_id?: number }
) {
  const download = await DbDownloads.create({
    media_id: mediaId,
    info_hash: infoHash,
    download_url: `magnet:${infoHash}`,
    status: 'completed',
    content_path: '/movies/The Matrix (1999)',
  })

  const file = await DbMediaFiles.create({
    media_id: mediaId,
    download_id: download.id,
    path: filePath,
    size: 8_000_000_000,
    duration: opts?.duration,
    episode_id: opts?.episode_id,
  })

  await DbMediaTracks.createMany(
    tracks.map((t) => ({ media_file_id: file.id, ...t }))
  )

  if (opts?.keyframes && opts.keyframes.length > 0) {
    await DbMediaKeyframes.createBatch(
      opts.keyframes.map((pts_time) => ({
        media_file_id: file.id,
        stream_index: 0,
        pts_time,
      }))
    )
  }

  return { download, file }
}
