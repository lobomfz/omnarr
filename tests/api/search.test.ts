import { beforeEach, describe, expect, test } from 'bun:test'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { TestSeed } from '../helpers/seed'
import '../mocks/tmdb'

const client = createRouterClient(router)

beforeEach(() => {
  TestSeed.reset()
})

describe('tmdb.search', () => {
  test('returns search results with poster_path and overview from TMDB', async () => {
    const results = await client.tmdb.search({ query: 'Matrix' })

    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('The Matrix')
    expect(results[0].poster_path).toBe('/poster.jpg')
    expect(results[0].overview).toBe(
      'A computer hacker learns about the true nature of reality.'
    )
  })

  test('returns empty array for query with no TMDB matches', async () => {
    const results = await client.tmdb.search({
      query: 'nonexistent movie xyz',
    })

    expect(results).toHaveLength(0)
  })
})
