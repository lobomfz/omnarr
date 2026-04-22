import '@/api/arktype'
import '@/jobs/workers/ripper'
import '@/jobs/workers/scan'
import '@/jobs/workers/subtitle-match'
import '@/jobs/workers/torrent-sync'
import { rpcHandler } from '@/api/app'
import { wsHandler } from '@/api/ws-app'
import { envVariables } from '@/lib/env'
import { playerSession } from '@/player/player-session'
import homepage from '@/web/index.html'

Bun.serve({
  port: envVariables.OMNARR_PORT,
  development: {
    hmr: true,
    console: true,
  },
  idleTimeout: 60,
  routes: {
    '/rpc/*': async (request: Request) => {
      const { response } = await rpcHandler.handle(request, {
        prefix: '/rpc',
        context: {},
      })

      return response ?? new Response('Not Found', { status: 404 })
    },
    '/hls/*': (request: Request) => playerSession.handle(request),
    '/ws': (request, server) => {
      if (server.upgrade(request)) {
        return new Response(null)
      }

      return new Response('Upgrade failed', { status: 500 })
    },
    '/*': homepage,
  },
  websocket: {
    message(ws, message) {
      void wsHandler.message(ws, message, { context: {} })
    },
    close(ws) {
      wsHandler.close(ws)
    },
  },
})

console.log(
  `omnarr web UI running at http://localhost:${envVariables.OMNARR_PORT}`
)
