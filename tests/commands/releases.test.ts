import { describe, expect, test, beforeEach } from 'bun:test'

import { testCommand } from '@bunli/test'

import { ReleasesCommand } from '@/commands/releases'
import { database, db } from '@/db/connection'
import { DbSearchResults } from '@/db/search-results'

import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'

beforeEach(() => {
  database.reset()
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

    expect(data).toHaveLength(4)
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
      flags: { json: true },
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
      flags: { json: true },
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
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)

    for (const r of data) {
      expect(r.indexer_source).toBe('beyond-hd')
    }
  })

  test('skips TMDB season fetch when fresh', async () => {
    const searchId = await setupTvSearch()

    await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true },
    })

    const before = await db
      .selectFrom('seasons as s')
      .select(['s.updated_at'])
      .orderBy('s.updated_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()

    await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true },
    })

    const after = await db
      .selectFrom('seasons as s')
      .select(['s.updated_at'])
      .orderBy('s.updated_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()

    expect(after.updated_at).toEqual(before.updated_at)
  })
})
