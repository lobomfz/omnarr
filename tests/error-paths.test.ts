import { describe, expect, test } from 'bun:test'

import { Releases } from '@/core/releases'
import { TmdbClient } from '@/integrations/tmdb/client'

import { TmdbMock } from './mocks/tmdb'
import './mocks/beyond-hd'
import './mocks/superflix'
import './mocks/yts'

describe('TmdbClient', () => {
  test('throws formatted error on API failure', async () => {
    await expect(() => new TmdbClient().getDetails(99999, 'movie')).toThrow(
      /TMDB/
    )
  })
})

await TmdbMock.db
  .insertInto('media')
  .values({
    id: 9999,
    name: 'No IMDB Show',
    overview: 'test',
    media_type: 'tv',
  })
  .execute()

await TmdbMock.db.insertInto('external_ids').values({ tmdb_id: 9999 }).execute()

describe('TmdbClient - no IMDB ID', () => {
  test('throws when TMDB entry has no IMDB ID', async () => {
    await expect(() => new TmdbClient().getDetails(9999, 'tv')).toThrow(
      /no IMDB ID/i
    )
  })
})

describe('Releases', () => {
  test('throws when media has no IMDB ID', async () => {
    await expect(() => new Releases().search(9999, 'tv')).toThrow(/no IMDB ID/i)
  })

  test('continues when one indexer fails', async () => {
    const releases = await new Releases().search(9998, 'movie')

    expect(releases).toHaveLength(0)
  })
})
