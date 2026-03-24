import { describe, expect, test } from 'bun:test'

import { TmdbClient } from '@/integrations/tmdb/client'
import { Releases } from '@/releases'

import { TmdbMock } from './mocks/tmdb'
import './mocks/beyond-hd'
import './mocks/yts'

describe('TmdbClient', () => {
  test('throws formatted error on API failure', async () => {
    await expect(() =>
      new TmdbClient().getDetails(99999, 'movie'),
    ).toThrow(/TMDB/)
  })
})

describe('Releases', () => {
  test('throws when media has no IMDB ID', async () => {
    await TmdbMock.db
      .insertInto('external_ids')
      .values({ tmdb_id: 1399 })
      .execute()

    await expect(() => Releases.fetch(1399, 'tv')).toThrow(
      'No IMDB ID found for this media.',
    )
  })
})
