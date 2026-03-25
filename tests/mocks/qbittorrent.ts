import { Mock } from '@lobomfz/ghostapi'
import { type } from 'arktype'

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
        url.match(/btih:([a-zA-Z0-9]+)/)?.[1]?.toLowerCase() ??
        url.split('/').pop() ??
        url

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
        })
        .execute()

      return 'Ok.'
    })
  },
  { port: 19005 }
)
