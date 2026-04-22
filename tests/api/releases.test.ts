import { beforeEach, describe, expect, test } from 'bun:test'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'
import '../mocks/superflix'
import { TestSeed } from '../helpers/seed'

const client = createRouterClient(router)

beforeEach(() => {
  TestSeed.reset()
})

describe('releases.search', () => {
  test('returns releases for a movie', async () => {
    const result = await client.releases.search({
      tmdb_id: 603,
      media_type: 'movie',
    })

    expect(result.releases.length).toBeGreaterThan(0)
  })

  test('returns releases sorted by seeders descending', async () => {
    const result = await client.releases.search({
      tmdb_id: 603,
      media_type: 'movie',
    })

    const seeders = result.releases.map((r) => r.seeders)

    for (let i = 1; i < seeders.length; i++) {
      expect(seeders[i]).toBeLessThanOrEqual(seeders[i - 1])
    }
  })

  test('returns releases with expected fields', async () => {
    const result = await client.releases.search({
      tmdb_id: 603,
      media_type: 'movie',
    })

    const release = result.releases[0]

    expect(typeof release.name).toBe('string')
    expect(release.size).toBeGreaterThan(0)
    expect(release.seeders).toBeGreaterThanOrEqual(0)
    expect(release.indexer_source).toBeOneOf(['beyond-hd', 'yts'])
    expect(typeof release.resolution).toBe('string')
  })
})
