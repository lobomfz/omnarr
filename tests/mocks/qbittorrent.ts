import { type } from '@lobomfz/db'
import { Mock } from '@lobomfz/ghostapi'

let generation = 0
const pending: Promise<void>[] = []

export const QBittorrentMock = new Mock(
  {
    torrents: type({
      hash: 'string',
      url: 'string',
      savepath: 'string',
      category: 'string',
      progress: 'number',
      dlspeed: 'number',
      eta: 'number',
      state: 'string',
      content_path: 'string',
    }),
  },
  (app, { db }) => {
    app.post('/api/v2/auth/login', ({ body }) => {
      const params = new URLSearchParams(body as string)

      if (
        params.get('username') !== 'admin' ||
        params.get('password') !== 'admin'
      ) {
        return new Response('Fails.', { status: 403 })
      }

      return new Response('Ok.', {
        headers: { 'Set-Cookie': 'SID=test-session-id; path=/' },
      })
    })

    app.get('/api/v2/torrents/info', ({ headers, query }) => {
      if (!headers.cookie?.includes('SID=test-session-id')) {
        return new Response('Forbidden', { status: 403 })
      }

      let q = db.selectFrom('torrents').selectAll()

      if (query.hashes) {
        const hashes = (query.hashes as string).split('|')
        q = q.where('hash', 'in', hashes)
      }

      if (query.category) {
        q = q.where('category', '=', query.category as string)
      }

      return q.execute()
    })

    app.post('/api/v2/torrents/add', async ({ headers, body }) => {
      if (!headers.cookie?.includes('SID=test-session-id')) {
        return new Response('Forbidden', { status: 403 })
      }

      const data = body as Record<string, string>
      const url = data.urls
      const savepath = data.savepath ?? ''
      const category = data.category ?? ''
      const hash =
        url.match(/btih:([^&]+)/)?.[1]?.toLowerCase() ??
        url.split('/').pop() ??
        url

      const existing = await db
        .selectFrom('torrents')
        .select('hash')
        .where('hash', '=', hash)
        .executeTakeFirst()

      if (existing) {
        return 'Fails.'
      }

      const gen = generation

      pending.push(
        Bun.sleep(Math.floor(Math.random() * 150) + 50).then(async () => {
          if (gen !== generation) {
            return
          }

          await db
            .insertInto('torrents')
            .values({
              hash,
              url,
              savepath,
              category,
              progress: 0,
              dlspeed: 0,
              eta: 0,
              state: 'downloading',
              content_path: `${savepath}/${hash}`,
            })
            .execute()
        })
      )

      return 'Ok.'
    })
  },
  { port: 19005 }
)

const originalReset = QBittorrentMock.reset.bind(QBittorrentMock)

QBittorrentMock.reset = () => {
  generation++
  pending.length = 0
  originalReset()
}
