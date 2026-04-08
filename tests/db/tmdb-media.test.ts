import { beforeEach, describe, expect, test } from 'bun:test'

import dayjs from 'dayjs'

import { database, db } from '@/db/connection'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'

beforeEach(() => {
  database.reset()
})

describe('DbTmdbMedia.getByTmdbId', () => {
  test('returns null seasons_updated_at when no seasons exist', async () => {
    await DbTmdbMedia.upsert({
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
      imdb_id: 'tt0903747',
      year: 2008,
    })

    const result = await DbTmdbMedia.getByTmdbId(1399, 'tv')

    expect(result).not.toBeUndefined()
    expect(result!.seasons_updated_at).toBeNull()
  })

  test('returns latest updated_at from seasons', async () => {
    const tmdb = await DbTmdbMedia.upsert({
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
      imdb_id: 'tt0903747',
      year: 2008,
    })

    await DbSeasons.upsert([
      {
        tmdb_media_id: tmdb.id,
        season_number: 1,
        title: 'Season 1',
        episode_count: 7,
      },
    ])

    const oldDate = dayjs().subtract(10, 'days').toDate()

    await db
      .updateTable('seasons')
      .set({ updated_at: oldDate })
      .where('season_number', '=', 1)
      .execute()

    await DbSeasons.upsert([
      {
        tmdb_media_id: tmdb.id,
        season_number: 2,
        title: 'Season 2',
        episode_count: 13,
      },
    ])

    const result = await DbTmdbMedia.getByTmdbId(1399, 'tv')

    expect(new Date(result!.seasons_updated_at!).getTime()).toBeGreaterThan(
      oldDate.getTime()
    )
  })

  test('returns undefined for non-existent tmdb_id', async () => {
    const result = await DbTmdbMedia.getByTmdbId(99999, 'movie')

    expect(result).toBeUndefined()
  })
})

describe('DbTmdbMedia.upsert', () => {
  test('partial upsert preserves existing metadata', async () => {
    await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      imdb_id: 'tt0133093',
      year: 1999,
      overview: 'A computer hacker learns about the true nature of reality.',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      runtime: 136,
      vote_average: 8.7,
      genres: 'Action,Sci-Fi',
    })

    await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      imdb_id: 'tt0133093',
      year: 1999,
    })

    const row = await db
      .selectFrom('tmdb_media')
      .where('tmdb_id', '=', 603)
      .where('media_type', '=', 'movie')
      .select([
        'overview',
        'poster_path',
        'backdrop_path',
        'runtime',
        'vote_average',
        'genres',
      ])
      .executeTakeFirstOrThrow()

    expect(row.overview).toBe(
      'A computer hacker learns about the true nature of reality.'
    )
    expect(row.poster_path).toBe('/poster.jpg')
    expect(row.backdrop_path).toBe('/backdrop.jpg')
    expect(row.runtime).toBe(136)
    expect(row.vote_average).toBe(8.7)
    expect(row.genres).toBe('Action,Sci-Fi')
  })

  test('round-trips backdrop_path', async () => {
    await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      imdb_id: 'tt0133093',
      year: 1999,
      backdrop_path: '/test.jpg',
    })

    const row = await db
      .selectFrom('tmdb_media')
      .where('tmdb_id', '=', 603)
      .where('media_type', '=', 'movie')
      .select(['backdrop_path'])
      .executeTakeFirstOrThrow()

    expect(row.backdrop_path).toBe('/test.jpg')
  })
})
