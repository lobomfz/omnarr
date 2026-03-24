import { describe, expect, test } from 'bun:test'

import { TmdbClient } from '@/integrations/tmdb/client'

import '../mocks/tmdb'

const tmdb = new TmdbClient()

describe('TmdbClient', () => {
  test('search finds movie by title', async () => {
    const results = await tmdb.search('Matrix')

    expect(results).toHaveLength(1)
    expect(results[0].tmdb_id).toBe(603)
    expect(results[0].media_type).toBe('movie')
    expect(results[0].title).toBe('The Matrix')
    expect(results[0].year).toBe(1999)
  })

  test('search finds tv by name', async () => {
    const results = await tmdb.search('Breaking')

    expect(results).toHaveLength(1)
    expect(results[0].tmdb_id).toBe(1399)
    expect(results[0].media_type).toBe('tv')
    expect(results[0].title).toBe('Breaking Bad')
    expect(results[0].year).toBe(2008)
  })

  test('getDetails returns parsed movie', async () => {
    const details = await tmdb.getDetails(603, 'movie')

    expect(details.tmdb_id).toBe(603)
    expect(details.title).toBe('The Matrix')
    expect(details.year).toBe(1999)
    expect(details.poster_path).toBe('/poster.jpg')
  })

  test('getDetails returns parsed tv', async () => {
    const details = await tmdb.getDetails(1399, 'tv')

    expect(details.tmdb_id).toBe(1399)
    expect(details.title).toBe('Breaking Bad')
    expect(details.year).toBe(2008)
  })

  test('getExternalIds returns imdb_id', async () => {
    const ids = await tmdb.getExternalIds(603, 'movie')

    expect(ids.imdb_id).toBe('tt0133093')
  })
})
