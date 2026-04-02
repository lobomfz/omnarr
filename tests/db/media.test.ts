import { beforeEach, describe, expect, test } from 'bun:test'

import { database, db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/lib/utils'

beforeEach(() => {
  database.reset()
})

async function seedMedia() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    imdb_id: 'tt0133093',
    year: 1999,
  })

  return await DbMedia.create({
    id: deriveId('603:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/movies',
  })
}

describe('DbMedia.delete', () => {
  test('removes media and returns deleted id', async () => {
    const media = await seedMedia()

    const deleted = await DbMedia.delete(media.id)

    expect(deleted?.id).toBe(media.id)

    const remaining = await db.selectFrom('media').selectAll().execute()

    expect(remaining).toHaveLength(0)
  })

  test('returns undefined for non-existent id', async () => {
    const deleted = await DbMedia.delete('NOEXIST')

    expect(deleted).toBeUndefined()
  })

  test('cascades to downloads', async () => {
    const media = await seedMedia()

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'HASH_1',
      download_url: 'magnet:test',
      status: 'completed',
    })

    await DbMedia.delete(media.id)

    const downloads = await db.selectFrom('downloads').selectAll().execute()

    expect(downloads).toHaveLength(0)
  })
})

async function seedTvMedia() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 1399,
    media_type: 'tv',
    title: 'Breaking Bad',
    imdb_id: 'tt0903747',
    year: 2008,
  })

  const media = await DbMedia.create({
    id: deriveId('1399:tv'),
    tmdb_media_id: tmdb.id,
    media_type: 'tv',
    root_folder: '/tv',
  })

  const [season] = await DbSeasons.upsert([
    {
      tmdb_media_id: tmdb.id,
      season_number: 1,
      title: 'Season 1',
      episode_count: 7,
    },
  ])

  const episodes = await DbEpisodes.upsert([
    { season_id: season.id, episode_number: 1, title: 'Pilot' },
    { season_id: season.id, episode_number: 2, title: "Cat's in the Bag..." },
  ])

  return { tmdb, media, season, episodes }
}

describe('DbMedia.list', () => {
  test('returns file_count and track_count', async () => {
    const media = await seedMedia()

    const download = await DbDownloads.create({
      media_id: media.id,
      source_id: 'HASH',
      download_url: 'magnet:test',
      status: 'completed',
    })

    const file = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/movie.mkv',
      size: 8_000_000_000,
    })

    await DbMediaTracks.createMany([
      {
        media_file_id: file.id,
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
      },
      {
        media_file_id: file.id,
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
      },
    ])

    const [row] = await DbMedia.list({})

    expect(row.file_count).toBe(1)
    expect(row.track_count).toBe(2)
  })

  test('returns download_status from latest non-error download', async () => {
    const media = await seedMedia()

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'ERR_HASH',
      download_url: 'magnet:err',
      status: 'error',
      error_at: new Date().toISOString(),
    })

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'DL_HASH',
      download_url: 'magnet:dl',
      status: 'downloading',
    })

    const [row] = await DbMedia.list({})

    expect(row.download_status).toBe('downloading')
  })

  test('returns episode counts for TV', async () => {
    const { media, episodes } = await seedTvMedia()

    const download = await DbDownloads.create({
      media_id: media.id,
      source_id: 'TV_HASH',
      download_url: 'magnet:tv',
      status: 'completed',
    })

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      episode_id: episodes[0].id,
      path: '/tv/s01e01.mkv',
      size: 1_000_000_000,
    })

    const [row] = await DbMedia.list({})

    expect(row.total_episodes).toBe(7)
    expect(row.episodes_with_files).toBe(1)
  })

  test('filters by media type', async () => {
    await seedMedia()
    await seedTvMedia()

    const movies = await DbMedia.list({ media_type: 'movie' })
    const tv = await DbMedia.list({ media_type: 'tv' })
    const all = await DbMedia.list({})

    expect(movies).toHaveLength(1)
    expect(movies[0].media_type).toBe('movie')
    expect(tv).toHaveLength(1)
    expect(tv[0].media_type).toBe('tv')
    expect(all).toHaveLength(2)
  })
})
