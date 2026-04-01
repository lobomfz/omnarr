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

  test('getDetails returns parsed movie with imdb_id', async () => {
    const details = await tmdb.getDetails(603, 'movie')

    expect(details.tmdb_id).toBe(603)
    expect(details.title).toBe('The Matrix')
    expect(details.year).toBe(1999)
    expect(details.poster_path).toBe('/poster.jpg')
    expect(details.imdb_id).toBe('tt0133093')
  })

  test('getDetails returns parsed tv with imdb_id', async () => {
    const details = await tmdb.getDetails(1399, 'tv')

    expect(details.tmdb_id).toBe(1399)
    expect(details.title).toBe('Breaking Bad')
    expect(details.year).toBe(2008)
    expect(details.imdb_id).toBe('tt0903747')
  })

  test('getExternalIds returns imdb_id', async () => {
    const ids = await tmdb.getExternalIds(603, 'movie')

    expect(ids.imdb_id).toBe('tt0133093')
  })

  test('getShowWithSeasons returns seasons for TV show', async () => {
    const result = await tmdb.getShowWithSeasons(1399)

    expect(result.title).toBe('Breaking Bad')
    expect(result.year).toBe(2008)
    expect(result.seasons).toHaveLength(2)
    expect(result.seasons[0].season_number).toBe(1)
    expect(result.seasons[0].name).toBe('Season 1')
    expect(result.seasons[0].episode_count).toBe(7)
  })

  test('getSeasonEpisodes returns episodes for a season', async () => {
    const episodes = await tmdb.getSeasonEpisodes(1399, 1)

    expect(episodes).toHaveLength(3)
    expect(episodes[0].episode_number).toBe(1)
    expect(episodes[0].name).toBe('Pilot')
  })
})
