import { beforeEach, describe, expect, test } from 'bun:test'

import dayjs from 'dayjs'

import { db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

describe('DbMedia.delete', () => {
  test('removes media and returns deleted id', async () => {
    const media = await TestSeed.library.matrix()

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
    const media = await TestSeed.library.matrix()

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
  return await TestSeed.library.tv({
    tmdbId: 1399,
    title: 'Breaking Bad',
    year: 2008,
    imdbId: 'tt0903747',
    rootFolder: '/tv',
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        episodeCount: 7,
        episodes: [
          { episodeNumber: 1, title: 'Pilot' },
          { episodeNumber: 2, title: "Cat's in the Bag..." },
        ],
      },
    ],
  })
}

describe('DbMedia.list', () => {
  test('returns file_count and track_count', async () => {
    const media = await TestSeed.library.matrix()

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

  test('returns download from latest non-error download', async () => {
    const media = await TestSeed.library.matrix()

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'ERR_HASH',
      download_url: 'magnet:err',
      status: 'error',
      error_at: new Date(),
    })

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'DL_HASH',
      download_url: 'magnet:dl',
      status: 'downloading',
    })

    const [row] = await DbMedia.list({})

    expect(row.download?.status).toBe('downloading')
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
    await TestSeed.library.matrix()
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

  test('filters out rows without backdrop in spotlight', async () => {
    await TestSeed.library.matrix()

    const result = await DbMedia.spotlight()

    expect(result.row).toBeUndefined()
  })

  test('returns trimmed shape for row with backdrop', async () => {
    const { media } = await TestSeed.library.tv({
      tmdbId: 1399,
      title: 'Breaking Bad',
      year: 2008,
      imdbId: 'tt0903747',
      overview: 'A chemistry teacher diagnosed with cancer.',
      backdropPath: '/backdrop.jpg',
      seasons: [],
    })

    const result = await DbMedia.spotlight()

    expect(result.row).toBeDefined()
    expect(result.row?.id).toBe(media.id)
    expect(result.row?.title).toBe('Breaking Bad')
    expect(result.row?.overview).toBe(
      'A chemistry teacher diagnosed with cancer.'
    )
    expect(result.row?.backdrop_path).toBe('/backdrop.jpg')
  })

  test('returns undefined row when library is empty', async () => {
    const result = await DbMedia.spotlight()

    expect(result.row).toBeUndefined()
  })

  test('returns rows ordered by added_at desc', async () => {
    const oldMedia = await TestSeed.library.matrix()

    await db
      .updateTable('media')
      .set({ added_at: dayjs().subtract(1, 'day').toDate() })
      .where('id', '=', oldMedia.id)
      .execute()

    const newMedia = await TestSeed.library.breakingBad()

    const rows = await DbMedia.list({})

    expect(rows).toHaveLength(2)
    expect(rows[0].id).toBe(newMedia.id)
    expect(rows[1].id).toBe(oldMedia.id)
  })
})
