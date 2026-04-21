import { beforeEach, describe, expect, test } from 'bun:test'

import { ORPCError, createRouterClient } from '@orpc/server'
import dayjs from 'dayjs'

import { router } from '@/api/router'
import '@/api/arktype'
import { db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { deriveId } from '@/lib/utils'

import { TestSeed } from '../helpers/seed'
import '../mocks/tmdb'

const client = createRouterClient(router)

beforeEach(() => {
  TestSeed.reset()
})

async function seedMovie() {
  return await TestSeed.library.matrix({
    rootFolder: '/movies',
    posterPath: '/abc123.jpg',
    backdropPath: '/backdrop.jpg',
    overview: 'A computer hacker learns about reality.',
  })
}

describe('library.list', () => {
  test('wiring: routes to DbMedia.list and returns data', async () => {
    await seedMovie()

    const result = await client.library.list({})

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('The Matrix')
    expect(result[0].poster_path).toBe('/abc123.jpg')
    expect(result[0].backdrop_path).toBe('/backdrop.jpg')
    expect(result[0].overview).toBe('A computer hacker learns about reality.')
  })

  test('passes media_type filter to db layer', async () => {
    await seedMovie()

    const result = await client.library.list({ media_type: 'tv' })

    expect(result).toHaveLength(0)
  })
})

describe('library.getInfo', () => {
  test('returns TMDB metadata for non-library item with added_at null and empty downloads', async () => {
    await TestSeed.search.matrix()
    const id = deriveId('603:movie')

    const result = await client.library.getInfo({ id })

    expect(result.title).toBe('The Matrix')
    expect(result.tmdb_id).toBe(603)
    expect(result.media_type).toBe('movie')
    expect(result.added_at).toBeNull()
    expect(result.downloads).toEqual([])
    expect(result.genres).toBeArray()
  })

  test('fetches from TMDB and populates tmdb_media on first access', async () => {
    await TestSeed.search.matrix()
    const id = deriveId('603:movie')

    const result = await client.library.getInfo({ id })

    expect(result.poster_path).toBe('/poster.jpg')
    expect(result.backdrop_path).toBe('/backdrop.jpg')
    expect(result.overview).toBe(
      'A computer hacker learns about the true nature of reality.'
    )
    expect(result.runtime).toBe(136)
    expect(result.vote_average).toBe(8.7)
  })

  test('returns library-enriched data when item is in library', async () => {
    const media = await seedMovie()

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'test_hash',
      download_url: 'magnet:test',
      status: 'completed',
    })

    const result = await client.library.getInfo({ id: media.id })

    expect(result.title).toBe('The Matrix')
    expect(result.year).toBe(1999)
    expect(result.added_at).not.toBeNull()
    expect(result.downloads).toHaveLength(1)
    expect(result.seasons).toHaveLength(0)
  })

  test('returns downloads with nested files and tracks', async () => {
    const media = await seedMovie()

    await TestSeed.player.downloadWithTracks(
      media.id,
      'full_hash',
      '/movies/The Matrix (1999)/matrix.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          language: 'eng',
          is_default: true,
          channel_layout: 'stereo',
        },
      ],
      { duration: 8160 }
    )

    const result = await client.library.getInfo({ id: media.id })

    expect(result.downloads).toHaveLength(1)

    const dl = result.downloads[0]
    expect(dl.files).toHaveLength(1)
    expect(dl.files[0].path).toBe('/movies/The Matrix (1999)/matrix.mkv')
    expect(dl.files[0].size).toBe(8_000_000_000)
    expect(dl.files[0].duration).toBe(8160)

    expect(dl.files[0].tracks).toHaveLength(2)
    expect(dl.files[0].tracks[0].stream_type).toBe('video')
    expect(dl.files[0].tracks[0].codec_name).toBe('h264')
    expect(dl.files[0].tracks[0].width).toBe(1920)
    expect(dl.files[0].tracks[1].stream_type).toBe('audio')
    expect(dl.files[0].tracks[1].language).toBe('eng')
  })

  test('returns active_scan when a scan is in progress', async () => {
    const media = await seedMovie()

    await TestSeed.player.downloadWithTracks(
      media.id,
      'done-release',
      '/downloads/movie-done.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          scan_ratio: 1,
        },
      ]
    )

    await TestSeed.player.downloadWithTracks(
      media.id,
      'active-release',
      '/downloads/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          scan_ratio: 0.4,
        },
      ]
    )

    const result = await client.library.getInfo({ id: media.id })

    expect(result.active_scan).toEqual({
      current: 1,
      total: 2,
      path: '/downloads/movie.mkv',
      ratio: 0.4,
    })
  })

  test('returns populated seasons array for TV shows', async () => {
    await TestSeed.search.breakingBad()
    const id = deriveId('1399:tv')

    const result = await client.library.getInfo({ id })

    expect(result.media_type).toBe('tv')
    expect(result.seasons.length).toBeGreaterThan(0)
    expect(result.seasons[0].season_number).toBe(1)
    expect(result.seasons[0].episodes.length).toBeGreaterThan(0)
    expect(result.seasons[0].episodes[0].episode_number).toBe(1)
  })

  test('skips season refetch when cache is fresh', async () => {
    await TestSeed.search.breakingBad()
    const id = deriveId('1399:tv')

    await client.library.getInfo({ id })

    const before = await db
      .selectFrom('seasons')
      .select(['id', 'updated_at'])
      .orderBy('season_number')
      .execute()

    await client.library.getInfo({ id })

    const after = await db
      .selectFrom('seasons')
      .select(['id', 'updated_at'])
      .orderBy('season_number')
      .execute()

    expect(after).toHaveLength(before.length)

    for (let i = 0; i < before.length; i++) {
      expect(after[i].updated_at.getTime()).toBe(before[i].updated_at.getTime())
    }
  })

  test('refetches seasons when cache is stale', async () => {
    await TestSeed.search.breakingBad()
    const id = deriveId('1399:tv')

    await client.library.getInfo({ id })

    await db
      .updateTable('seasons')
      .set({ updated_at: dayjs().subtract(8, 'day').toDate() })
      .execute()

    const stale = await db
      .selectFrom('seasons')
      .select(['updated_at'])
      .orderBy('season_number')
      .execute()

    await client.library.getInfo({ id })

    const refreshed = await db
      .selectFrom('seasons')
      .select(['updated_at'])
      .orderBy('season_number')
      .execute()

    expect(refreshed[0].updated_at.getTime()).toBeGreaterThan(
      stale[0].updated_at.getTime()
    )
  })

  test('returns empty genres array when movie has none', async () => {
    await TestSeed.search.result(9998, 'movie', 'No Genres Movie')
    const id = deriveId('9998:movie')

    const result = await client.library.getInfo({ id })

    expect(result.genres).toEqual([])
  })

  test('throws when ID does not exist in search_results or tmdb_media', async () => {
     expect(() => client.library.getInfo({ id: 'NOTEXIST' })).toThrow()
  })

  test('non-existent ID error has proper HTTP status', async () => {
    const error = await client.library
      .getInfo({ id: 'NOTEXIST' })
      .catch((e) => e)

    expect(error).toBeInstanceOf(ORPCError)
    expect(error).toHaveProperty('code', 'SEARCH_RESULT_NOT_FOUND')
    expect(error.status).not.toBe(500)
  })
})

describe('library.rescan', () => {
  test('throws when media does not exist', async () => {
     expect(() => client.library.rescan({ media_id: 'NOTEXIST' })).toThrow(
      'MEDIA_NOT_FOUND'
    )
  })

  test('returns media_id for existing media', async () => {
    const media = await seedMovie()

    const result = await client.library.rescan({ media_id: media.id })

    expect(result.media_id).toBe(media.id)
  })
})
