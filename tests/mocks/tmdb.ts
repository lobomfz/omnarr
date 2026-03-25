import { Mock } from '@lobomfz/ghostapi'
import { type } from 'arktype'

import { envVariables } from '@/env'

export const TmdbMock = new Mock(
  {
    media: type({
      id: 'number',
      'title?': 'string',
      'name?': 'string',
      overview: 'string',
      'poster_path?': 'string',
      'release_date?': 'string',
      'first_air_date?': 'string',
      media_type: "'movie' | 'tv'",
    }),
    external_ids: type({
      tmdb_id: 'number',
      'imdb_id?': 'string',
    }),
  },
  (app, { db }) => {
    app.get(
      '/search/multi',
      async ({ query }) => {
        const q = `%${query.query}%`

        const results = await db
          .selectFrom('media')
          .selectAll()
          .where((eb) => eb.or([eb('title', 'like', q), eb('name', 'like', q)]))
          .execute()

        return {
          page: 1,
          results,
          total_pages: 1,
          total_results: results.length,
        }
      },
      { query: type({ 'query?': 'string' }) }
    )

    app.get(
      '/:mediaType/:id',
      async ({ params }) => {
        return await db
          .selectFrom('media')
          .selectAll()
          .where('id', '=', params.id)
          .executeTakeFirstOrThrow()
      },
      {
        params: type({
          mediaType: "'movie' | 'tv'",
          id: 'string.integer.parse',
        }),
      }
    )

    app.get(
      '/:mediaType/:id/external_ids',
      async ({ params }) => {
        return await db
          .selectFrom('external_ids')
          .selectAll()
          .where('tmdb_id', '=', params.id)
          .executeTakeFirstOrThrow()
      },
      {
        params: type({
          mediaType: "'movie' | 'tv'",
          id: 'string.integer.parse',
        }),
      }
    )
  },
  {
    base_url: envVariables.TMDB_API_URL,
  }
)

await TmdbMock.db
  .insertInto('media')
  .values([
    {
      id: 603,
      title: 'The Matrix',
      overview: 'A computer hacker learns about the true nature of reality.',
      release_date: '1999-03-31',
      poster_path: '/poster.jpg',
      media_type: 'movie',
    },
    {
      id: 1399,
      name: 'Breaking Bad',
      overview: 'A chemistry teacher diagnosed with cancer.',
      first_air_date: '2008-01-20',
      media_type: 'tv',
    },
  ])
  .execute()

await TmdbMock.db
  .insertInto('external_ids')
  .values({ tmdb_id: 603, imdb_id: 'tt0133093' })
  .execute()
