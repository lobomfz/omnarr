import { Mock } from '@lobomfz/ghostapi'
import { type } from 'arktype'
import { strToU8, zipSync } from 'fflate'

import { envVariables } from '@/env'

const zipContent = zipSync({
  'subtitle.srt': strToU8('1\n00:00:01,000 --> 00:00:02,000\nTest subtitle\n'),
})

const zipWithoutSrt = zipSync({
  'readme.txt': strToU8('No subtitle here'),
})

const SubdlMock = new Mock(
  {
    subtitles: type({
      id: 'number',
      release_name: 'string',
      name: 'string',
      lang: 'string',
      language: 'string',
      author: 'string',
      url: 'string',
      imdb_id: 'string',
      'season?': 'number.integer',
      'episode?': 'number.integer',
    }),
  },
  (app, { db }) => {
    app.get(
      '/api/v1/subtitles',
      async ({ query }) => {
        if (!query.api_key) {
          return { status: false, error: 'API key required' }
        }

        let q = db.selectFrom('subtitles').selectAll()

        if (query.imdb_id) {
          q = q.where('imdb_id', '=', query.imdb_id)
        }

        if (query.languages) {
          const langs = query.languages.split(',')
          q = q.where('language', 'in', langs)
        }

        if (query.season_number) {
          q = q.where('season', '=', Number(query.season_number))
        }

        if (query.episode_number) {
          q = q.where('episode', '=', Number(query.episode_number))
        }

        const rows = await q.execute()

        return {
          status: true,
          results: [],
          subtitles: rows,
        }
      },
      {
        query: type({
          'api_key?': 'string',
          'imdb_id?': 'string',
          'languages?': 'string',
          'season_number?': 'string',
          'episode_number?': 'string',
          'subs_per_page?': 'string',
        }),
      }
    )

    app.get('/subtitle/:path', ({ params }) => {
      const content = params.path.includes('no-srt')
        ? zipWithoutSrt
        : zipContent

      return new Response(Buffer.from(content), {
        headers: { 'content-type': 'application/zip' },
      })
    })
  },
  {
    base_url: envVariables.SUBDL_API_URL,
  }
)

await SubdlMock.db
  .insertInto('subtitles')
  .values([
    {
      id: 1,
      release_name: 'The.Matrix.1999.1080p.BluRay-GROUP',
      name: 'SUBDL.com::matrix.1080p.zip',
      lang: 'english',
      language: 'EN',
      author: 'testuser',
      url: '/subtitle/100-200.zip',
      imdb_id: 'tt0133093',
    },
    {
      id: 2,
      release_name: 'The.Matrix.1999.2160p.UHD-OTHER',
      name: 'SUBDL.com::matrix.2160p.zip',
      lang: 'english',
      language: 'EN',
      author: 'testuser2',
      url: '/subtitle/100-201.zip',
      imdb_id: 'tt0133093',
    },
    {
      id: 3,
      release_name: 'The.Matrix.1999.1080p-FR',
      name: 'SUBDL.com::matrix.fr.zip',
      lang: 'french',
      language: 'FR',
      author: 'frenchuser',
      url: '/subtitle/100-202.zip',
      imdb_id: 'tt0133093',
    },
    {
      id: 4,
      release_name: 'Breaking.Bad.S01E01-GROUP',
      name: 'SUBDL.com::bb.s01e01.zip',
      lang: 'english',
      language: 'EN',
      author: 'tvuser',
      url: '/subtitle/200-300.zip',
      imdb_id: 'tt0903747',
      season: 1,
      episode: 1,
    },
    {
      id: 5,
      release_name: 'Breaking.Bad.S01E02-GROUP',
      name: 'SUBDL.com::bb.s01e02.zip',
      lang: 'english',
      language: 'EN',
      author: 'tvuser',
      url: '/subtitle/200-301.zip',
      imdb_id: 'tt0903747',
      season: 1,
      episode: 2,
    },
  ])
  .execute()
