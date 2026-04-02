import { describe, expect, test, beforeEach } from 'bun:test'

import { testCommand } from '@bunli/test'
import dayjs from 'dayjs'

import { ReleasesCommand } from '@/commands/releases'
import { database, db } from '@/db/connection'
import { DbSearchResults } from '@/db/search-results'

import { TmdbMock } from '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/superflix'
import '../mocks/yts'

beforeEach(() => {
  database.reset()
  TmdbMock.reset('tv_season_failures')
})

async function setupMovieSearch() {
  const results = await DbSearchResults.upsert([
    { tmdb_id: 603, media_type: 'movie', title: 'The Matrix', year: 1999 },
  ])

  return results[0].id
}

async function setupTvSearch() {
  const results = await DbSearchResults.upsert([
    {
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
      year: 2008,
    },
  ])

  return results[0].id
}

describe('releases command', () => {
  test('returns combined results from all indexers', async () => {
    const searchId = await setupMovieSearch()

    const result = await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(5)
    expect(data[0].id).toHaveLength(6)
  })

  test('includes seeders, size, resolution, codec', async () => {
    const searchId = await setupMovieSearch()

    const result = await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)
    const bhd = data.find((r: any) => r.name.includes('2160p.UHD.BluRay.x265'))

    expect(bhd.seeders).toBe(42)
    expect(bhd.size).toBe(50_000_000_000)
    expect(bhd.resolution).toBe('2160p')
    expect(bhd.codec).toBe('x265')
  })

  test('movie releases have null season/episode', async () => {
    const searchId = await setupMovieSearch()

    const result = await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)

    for (const r of data) {
      expect(r.season_number).toBeNull()
      expect(r.episode_number).toBeNull()
    }
  })
})

describe('TV releases', () => {
  test('fetches and stores seasons/episodes from TMDB', async () => {
    const searchId = await setupTvSearch()

    await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true, season: '1' },
    })

    const seasons = await db.selectFrom('seasons').selectAll().execute()

    expect(seasons.length).toBeGreaterThan(0)

    const episodes = await db.selectFrom('episodes').selectAll().execute()

    expect(episodes.length).toBeGreaterThan(0)
  })

  test('parses S/E from release names', async () => {
    const searchId = await setupTvSearch()

    const result = await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true, season: '1' },
    })

    const data = JSON.parse(result.stdout)
    const episode = data.find((r: any) => r.name.includes('S01E01'))
    const pack = data.find((r: any) => r.name.includes('S01.COMPLETE'))

    expect(episode.season_number).toBe(1)
    expect(episode.episode_number).toBe(1)

    expect(pack.season_number).toBe(1)
    expect(pack.episode_number).toBeNull()
  })

  test('--season filters releases by season', async () => {
    const searchId = await setupTvSearch()

    const result = await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true, season: '1' },
    })

    const data = JSON.parse(result.stdout)

    for (const r of data) {
      expect(r.season_number).toBe(1)
    }

    expect(data.find((r: any) => r.name.includes('S02E01'))).toBeUndefined()
  })

  test('YTS not called for TV searches', async () => {
    const searchId = await setupTvSearch()

    const result = await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true, season: '1' },
    })

    const data = JSON.parse(result.stdout)

    for (const r of data) {
      expect(r.indexer_source).not.toBe('yts')
    }
  })

  test('skips TMDB season fetch when fresh', async () => {
    const searchId = await setupTvSearch()

    await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true, season: '1' },
    })

    const before = await db
      .selectFrom('seasons as s')
      .select(['s.updated_at'])
      .orderBy('s.updated_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()

    await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true, season: '1' },
    })

    const after = await db
      .selectFrom('seasons as s')
      .select(['s.updated_at'])
      .orderBy('s.updated_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()

    expect(after.updated_at).toEqual(before.updated_at)
  })

  test('does not persist partial TV cache when season sync fails', async () => {
    const searchId = await setupTvSearch()

    await TmdbMock.db
      .insertInto('tv_season_failures')
      .values({ tmdb_id: 1399, season_number: 2 })
      .execute()

    const failed = await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true, season: '1' },
    })

    expect(failed.exitCode).not.toBe(0)

    const seasonsAfterFailure = await db
      .selectFrom('seasons')
      .selectAll()
      .execute()
    const episodesAfterFailure = await db
      .selectFrom('episodes')
      .selectAll()
      .execute()

    expect(seasonsAfterFailure).toHaveLength(0)
    expect(episodesAfterFailure).toHaveLength(0)

    TmdbMock.reset('tv_season_failures')

    const retried = await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true, season: '1' },
    })

    expect(retried.exitCode).toBe(0)

    const seasonsAfterRetry = await db
      .selectFrom('seasons')
      .selectAll()
      .execute()
    const episodesAfterRetry = await db
      .selectFrom('episodes')
      .selectAll()
      .execute()

    expect(seasonsAfterRetry).toHaveLength(2)
    expect(episodesAfterRetry.length).toBeGreaterThan(0)
  })

  test('re-fetches seasons when TTL expired', async () => {
    const searchId = await setupTvSearch()

    await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true, season: '1' },
    })

    const oldDate = dayjs().subtract(8, 'days').toDate()

    await db.updateTable('seasons').set({ updated_at: oldDate }).execute()

    const before = await db
      .selectFrom('seasons as s')
      .select(['s.updated_at'])
      .orderBy('s.updated_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()

    expect(new Date(before.updated_at).getTime()).toBeLessThan(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    )

    await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true, season: '1' },
    })

    const after = await db
      .selectFrom('seasons as s')
      .select(['s.updated_at'])
      .orderBy('s.updated_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()

    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      oldDate.getTime()
    )
  })
})
