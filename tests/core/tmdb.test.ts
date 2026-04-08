import { beforeEach, describe, expect, test } from 'bun:test'

import dayjs from 'dayjs'

import { Tmdb } from '@/core/tmdb'
import { database, db } from '@/db/connection'
import { DbSearchResults } from '@/db/search-results'

import '../mocks/tmdb'

beforeEach(() => {
  database.reset()
})

async function seedSearch(tmdbId: number, mediaType: 'movie' | 'tv') {
  const [row] = await DbSearchResults.upsert([
    { tmdb_id: tmdbId, media_type: mediaType, title: 'seed' },
  ])

  return row.id
}

describe('Tmdb.getInfo', () => {
  test('throws when search result is missing', async () => {
    await expect(() => Tmdb.getInfo('NOEXIST')).toThrow(
      'SEARCH_RESULT_NOT_FOUND'
    )
  })

  test('returns movie with runtime, vote_average and genres', async () => {
    const id = await seedSearch(603, 'movie')

    const info = await Tmdb.getInfo(id)

    expect(info.tmdb_id).toBe(603)
    expect(info.media_type).toBe('movie')
    expect(info.title).toBe('The Matrix')
    expect(info.year).toBe(1999)
    expect(info.runtime).toBe(136)
    expect(info.vote_average).toBe(8.7)
    expect(info.genres).toEqual(['Action', 'Science Fiction'])
    expect(info.backdrop_path).toBe('/backdrop.jpg')
    expect(info.seasons).toEqual([])
  })

  test('returns empty genres array when movie has none', async () => {
    const id = await seedSearch(9998, 'movie')

    const info = await Tmdb.getInfo(id)

    expect(info.genres).toEqual([])
  })

  test('throws when movie has no imdb id', async () => {
    const id = await seedSearch(7777, 'movie')

    await expect(() => Tmdb.getInfo(id)).toThrow('NO_IMDB_ID')
  })

  test('averages episode_run_time for tv runtime', async () => {
    const id = await seedSearch(1399, 'tv')

    const info = await Tmdb.getInfo(id)

    expect(info.runtime).toBe(46)
  })

  test('returns null runtime when tv has no runtime fields', async () => {
    const id = await seedSearch(8888, 'tv')

    const info = await Tmdb.getInfo(id)

    expect(info.runtime).toBeNull()
  })

  test('persists seasons and episodes on first tv fetch', async () => {
    const id = await seedSearch(1399, 'tv')

    const info = await Tmdb.getInfo(id)

    expect(info.seasons).toHaveLength(2)
    expect(info.seasons[0].season_number).toBe(1)
    expect(info.seasons[0].episode_count).toBe(7)

    const episodes = await db.selectFrom('episodes').selectAll().execute()

    expect(episodes).toHaveLength(5)
  })

  test('skips refetch when seasons cache is fresh', async () => {
    const id = await seedSearch(1399, 'tv')

    await Tmdb.getInfo(id)

    const before = await db
      .selectFrom('seasons')
      .select(['id', 'updated_at'])
      .orderBy('season_number')
      .execute()

    await Tmdb.getInfo(id)

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
    const id = await seedSearch(1399, 'tv')

    await Tmdb.getInfo(id)

    await db
      .updateTable('seasons')
      .set({ updated_at: dayjs().subtract(8, 'day').toDate() })
      .execute()

    const stale = await db
      .selectFrom('seasons')
      .select(['updated_at'])
      .orderBy('season_number')
      .execute()

    await Tmdb.getInfo(id)

    const refreshed = await db
      .selectFrom('seasons')
      .select(['updated_at'])
      .orderBy('season_number')
      .execute()

    expect(refreshed[0].updated_at.getTime()).toBeGreaterThan(
      stale[0].updated_at.getTime()
    )
  })
})
