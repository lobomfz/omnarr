import { Mock } from '@lobomfz/ghostapi'
import { type } from 'arktype'

import { envVariables } from '@/env'

const YtsMock = new Mock(
  {
    movies: type({
      id: 'number',
      title: 'string',
      year: 'number',
      imdb_code: 'string',
    }),
    torrents: type({
      movie_id: 'number',
      hash: 'string',
      quality: 'string',
      type: 'string',
      video_codec: 'string',
      seeds: 'number',
      size_bytes: 'number',
    }),
  },
  (app, { db }) => {
    app.get(
      '/list_movies.json',
      async ({ query }) => {
        const movies = await db
          .selectFrom('movies')
          .selectAll()
          .where('imdb_code', '=', query.query_term!)
          .execute()

        if (movies.length === 0) {
          return { data: { movie_count: 0, movies: undefined } }
        }

        const moviesWithTorrents = await Promise.all(
          movies.map(async (m) => {
            const torrents = await db
              .selectFrom('torrents')
              .selectAll()
              .where('movie_id', '=', m.id)
              .execute()

            return { ...m, torrents }
          })
        )

        return {
          data: {
            movie_count: movies.length,
            movies: moviesWithTorrents,
          },
        }
      },
      { query: type({ 'query_term?': 'string' }) }
    )
  },
  {
    base_url: envVariables.YTS_API_URL,
  }
)

await YtsMock.db
  .insertInto('movies')
  .values({
    id: 1,
    title: 'The Matrix',
    year: 1999,
    imdb_code: 'tt0133093',
  })
  .execute()

await YtsMock.db
  .insertInto('torrents')
  .values([
    {
      movie_id: 1,
      hash: 'yts_hash_1080',
      quality: '1080p',
      type: 'bluray',
      video_codec: 'x264',
      seeds: 200,
      size_bytes: 2_000_000_000,
    },
    {
      movie_id: 1,
      hash: 'yts_hash_2160',
      quality: '2160p',
      type: 'bluray',
      video_codec: 'x265',
      seeds: 50,
      size_bytes: 5_000_000_000,
    },
  ])
  .execute()
