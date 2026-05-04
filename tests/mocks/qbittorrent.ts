import { type } from '@lobomfz/db'
import { Mock } from '@lobomfz/ghostapi'

const pendingAdds = new Set<NodeJS.Timeout>()

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
        const hashes = query.hashes.split('|')
        q = q.where('hash', 'in', hashes)
      }

      if (query.category) {
        q = q.where('category', '=', query.category)
      }

      return q.execute()
    })

    app.post(
      '/api/v2/torrents/add',
      async ({ headers, body }) => {
        if (!headers.cookie?.includes('SID=test-session-id')) {
          return new Response('Forbidden', { status: 403 })
        }

        const url = body.urls
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

        const savepath = body.savepath ?? `/downloads/${body.category}`
        const timer = setTimeout(
          () => {
            pendingAdds.delete(timer)

            void db
              .insertInto('torrents')
              .values({
                hash,
                url,
                savepath,
                category: body.category,
                progress: 0,
                dlspeed: 0,
                eta: 0,
                state: 'downloading',
                content_path: `${savepath}/${hash}`,
              })
              .execute()
          },
          Math.floor(Math.random() * 150) + 50
        )

        pendingAdds.add(timer)

        return 'Ok.'
      },
      {
        body: type({
          urls: 'string',
          category: 'string',
          'savepath?': 'string',
        }),
      }
    )

    return {
      cancelPendingAdds() {
        pendingAdds.forEach((timer) => clearTimeout(timer))
        pendingAdds.clear()
      },
    }
  },
  { port: 19005 }
)
