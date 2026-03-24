import { Mock } from '@lobomfz/ghostapi'
import { type } from 'arktype'

export const BeyondHdMock = new Mock(
  {
    results: type({
      id: 'number',
      name: 'string',
      info_hash: 'string',
      size: 'number',
      seeders: 'number',
      category: 'string',
      'imdb_id?': 'string',
      dv: 'number',
      hdr10: 'number',
      hdr10plus: 'number',
      hlg: 'number',
      download_url: 'string',
    }),
  },
  (app, { db }) => {
    app.post(
      '/:api_key',
      async () => {
        const rows = await db.selectFrom('results').selectAll().execute()

        return {
          status_code: 0,
          results: rows.map((r) => Object.assign(r, { 'hdr10+': r.hdr10plus })),
          success: true,
        }
      },
      { params: type({ api_key: 'string' }) }
    )
  }
)

await BeyondHdMock.db
  .insertInto('results')
  .values([
    {
      id: 1001,
      name: 'The.Matrix.1999.2160p.UHD.BluRay.x265-GROUP',
      info_hash: 'abc123',
      size: 50_000_000_000,
      seeders: 42,
      category: '2160p',
      imdb_id: 'tt0133093',
      dv: 1,
      hdr10: 1,
      hdr10plus: 0,
      hlg: 0,
      download_url: 'https://beyond-hd.me/dl/abc123',
    },
    {
      id: 1002,
      name: 'The.Matrix.1999.1080p.BluRay.x264-OTHER',
      info_hash: 'def456',
      size: 15_000_000_000,
      seeders: 100,
      category: '1080p',
      imdb_id: 'tt0133093',
      dv: 0,
      hdr10: 0,
      hdr10plus: 0,
      hlg: 0,
      download_url: 'https://beyond-hd.me/dl/def456',
    },
  ])
  .execute()

BeyondHdMock.listen(19003)
