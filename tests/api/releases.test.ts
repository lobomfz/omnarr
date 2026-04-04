import { beforeEach, describe, expect, test } from 'bun:test'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { database } from '@/db/connection'

import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'
import '../mocks/superflix'

const client = createRouterClient(router)

beforeEach(() => {
  database.reset('releases')
  database.reset('search_results')
  database.reset('tmdb_media')
})

describe('releases.search', () => {
  test('returns releases for a movie', async () => {
    const result = await client.releases.search({
      tmdb_id: 603,
      media_type: 'movie',
    })

    expect(result.length).toBeGreaterThan(0)
  })

  test('returns releases with expected fields', async () => {
    const result = await client.releases.search({
      tmdb_id: 603,
      media_type: 'movie',
    })

    const release = result[0]

    expect(typeof release.name).toBe('string')
    expect(release.size).toBeGreaterThan(0)
    expect(release.seeders).toBeGreaterThanOrEqual(0)
    expect(release.indexer_source).toBeOneOf(['beyond-hd', 'yts'])
    expect(typeof release.resolution).toBe('string')
  })
})
