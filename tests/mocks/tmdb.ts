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
    tv_seasons: type({
      tmdb_id: 'number',
      season_number: 'number',
      name: 'string',
      episode_count: 'number',
    }),
    tv_episodes: type({
      tmdb_id: 'number',
      season_number: 'number',
      episode_number: 'number',
      name: 'string',
    }),
    tv_season_failures: type({
      tmdb_id: 'number',
      season_number: 'number',
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
      '/tv/:id/season/:number',
      async ({ params }) => {
        const failure = await db
          .selectFrom('tv_season_failures')
          .select('tmdb_id')
          .where('tmdb_id', '=', params.id)
          .where('season_number', '=', params.number)
          .executeTakeFirst()

        if (failure) {
          return new Response('Season fetch failed', { status: 500 })
        }

        const episodes = await db
          .selectFrom('tv_episodes')
          .select(['episode_number', 'name'])
          .where('tmdb_id', '=', params.id)
          .where('season_number', '=', params.number)
          .execute()

        return { episodes }
      },
      {
        params: type({
          id: 'string.integer.parse',
          number: 'string.integer.parse',
        }),
      }
    )

    app.get(
      '/:mediaType/:id',
      async ({ params }) => {
        const media = await db
          .selectFrom('media')
          .selectAll()
          .where('id', '=', params.id)
          .executeTakeFirstOrThrow()

        if (params.mediaType === 'tv') {
          const seasons = await db
            .selectFrom('tv_seasons')
            .select(['season_number', 'name', 'episode_count'])
            .where('tmdb_id', '=', params.id)
            .execute()

          return { ...media, seasons }
        }

        return media
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
  .values([
    { tmdb_id: 603, imdb_id: 'tt0133093' },
    { tmdb_id: 1399, imdb_id: 'tt0903747' },
  ])
  .execute()

await TmdbMock.db
  .insertInto('tv_seasons')
  .values([
    { tmdb_id: 1399, season_number: 1, name: 'Season 1', episode_count: 7 },
    { tmdb_id: 1399, season_number: 2, name: 'Season 2', episode_count: 13 },
  ])
  .execute()

await TmdbMock.db
  .insertInto('tv_episodes')
  .values([
    { tmdb_id: 1399, season_number: 1, episode_number: 1, name: 'Pilot' },
    {
      tmdb_id: 1399,
      season_number: 1,
      episode_number: 2,
      name: "Cat's in the Bag...",
    },
    {
      tmdb_id: 1399,
      season_number: 1,
      episode_number: 3,
      name: "...And the Bag's in the River",
    },
    {
      tmdb_id: 1399,
      season_number: 2,
      episode_number: 1,
      name: 'Seven Thirty-Seven',
    },
    { tmdb_id: 1399, season_number: 2, episode_number: 2, name: 'Grilled' },
  ])
  .execute()
