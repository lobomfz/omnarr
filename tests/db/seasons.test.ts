import { describe, expect, test, beforeEach } from 'bun:test'

import { db } from '@/db/connection'
import { DbEpisodes } from '@/db/episodes'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

async function seedTmdbMedia() {
  return await DbTmdbMedia.upsert({
    tmdb_id: 1399,
    media_type: 'tv',
    title: 'Breaking Bad',
    imdb_id: 'tt0903747',
    year: 2008,
  })
}

describe('DbSeasons', () => {
  test('upsert creates seasons', async () => {
    const tmdb = await seedTmdbMedia()

    const seasons = await DbSeasons.upsert([
      {
        tmdb_media_id: tmdb.id,
        season_number: 1,
        title: 'Season 1',
        episode_count: 7,
      },
    ])

    expect(seasons).toHaveLength(1)
    expect(seasons[0].id).toBeGreaterThan(0)
    expect(seasons[0].tmdb_media_id).toBe(tmdb.id)
    expect(seasons[0].season_number).toBe(1)
    expect(seasons[0].title).toBe('Season 1')
    expect(seasons[0].episode_count).toBe(7)
  })

  test('upsert updates on conflict', async () => {
    const tmdb = await seedTmdbMedia()

    await DbSeasons.upsert([
      {
        tmdb_media_id: tmdb.id,
        season_number: 1,
        title: 'Season 1',
        episode_count: 7,
      },
    ])

    const [updated] = await DbSeasons.upsert([
      {
        tmdb_media_id: tmdb.id,
        season_number: 1,
        title: 'Season 1 Updated',
        episode_count: 8,
      },
    ])

    expect(updated.title).toBe('Season 1 Updated')
    expect(updated.episode_count).toBe(8)

    const all = await db.selectFrom('seasons').selectAll().execute()

    expect(all).toHaveLength(1)
  })

  test('batch upsert multiple seasons', async () => {
    const tmdb = await seedTmdbMedia()

    const seasons = await DbSeasons.upsert([
      { tmdb_media_id: tmdb.id, season_number: 1 },
      { tmdb_media_id: tmdb.id, season_number: 2 },
    ])

    expect(seasons).toHaveLength(2)
  })

  test('cascade deletes when tmdb_media is deleted', async () => {
    const tmdb = await seedTmdbMedia()

    await DbSeasons.upsert([
      { tmdb_media_id: tmdb.id, season_number: 1 },
      { tmdb_media_id: tmdb.id, season_number: 2 },
    ])

    await db.deleteFrom('tmdb_media').where('id', '=', tmdb.id).execute()

    const seasons = await db.selectFrom('seasons').selectAll().execute()

    expect(seasons).toHaveLength(0)
  })
})

describe('DbEpisodes', () => {
  test('upsert creates episodes', async () => {
    const tmdb = await seedTmdbMedia()
    const [season] = await DbSeasons.upsert([
      { tmdb_media_id: tmdb.id, season_number: 1 },
    ])

    const episodes = await DbEpisodes.upsert([
      { season_id: season.id, episode_number: 1, title: 'Pilot' },
    ])

    expect(episodes).toHaveLength(1)
    expect(episodes[0].id).toBeGreaterThan(0)
    expect(episodes[0].season_id).toBe(season.id)
    expect(episodes[0].episode_number).toBe(1)
    expect(episodes[0].title).toBe('Pilot')
  })

  test('upsert updates on conflict', async () => {
    const tmdb = await seedTmdbMedia()
    const [season] = await DbSeasons.upsert([
      { tmdb_media_id: tmdb.id, season_number: 1 },
    ])

    await DbEpisodes.upsert([
      { season_id: season.id, episode_number: 1, title: 'Pilot' },
    ])

    const [updated] = await DbEpisodes.upsert([
      { season_id: season.id, episode_number: 1, title: 'Pilot (Updated)' },
    ])

    expect(updated.title).toBe('Pilot (Updated)')

    const all = await db.selectFrom('episodes').selectAll().execute()

    expect(all).toHaveLength(1)
  })

  test('batch upsert multiple episodes', async () => {
    const tmdb = await seedTmdbMedia()
    const [season] = await DbSeasons.upsert([
      { tmdb_media_id: tmdb.id, season_number: 1 },
    ])

    const episodes = await DbEpisodes.upsert([
      { season_id: season.id, episode_number: 1, title: 'Pilot' },
      { season_id: season.id, episode_number: 2, title: 'Second' },
    ])

    expect(episodes).toHaveLength(2)
  })

  test('cascade deletes when season is deleted', async () => {
    const tmdb = await seedTmdbMedia()
    const [season] = await DbSeasons.upsert([
      { tmdb_media_id: tmdb.id, season_number: 1 },
    ])

    await DbEpisodes.upsert([
      { season_id: season.id, episode_number: 1 },
      { season_id: season.id, episode_number: 2 },
    ])

    await db.deleteFrom('seasons').where('id', '=', season.id).execute()

    const episodes = await db.selectFrom('episodes').selectAll().execute()

    expect(episodes).toHaveLength(0)
  })

  test('cascade deletes from tmdb_media through seasons', async () => {
    const tmdb = await seedTmdbMedia()
    const [season] = await DbSeasons.upsert([
      { tmdb_media_id: tmdb.id, season_number: 1 },
    ])

    await DbEpisodes.upsert([{ season_id: season.id, episode_number: 1 }])

    await db.deleteFrom('tmdb_media').where('id', '=', tmdb.id).execute()

    const episodes = await db.selectFrom('episodes').selectAll().execute()

    expect(episodes).toHaveLength(0)
  })
})
