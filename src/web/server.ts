import '@/api/arktype'
import '@/jobs/workers/ripper'
import '@/jobs/workers/scan'
import '@/jobs/workers/subtitle-match'
import { rpcHandler } from '@/api/app'
import { wsHandler } from '@/api/ws-app'
import { envVariables } from '@/lib/env'
import homepage from '@/web/index.html'

Bun.serve({
  port: envVariables.OMNARR_PORT,
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    '/rpc/*': async (request: Request) => {
      const { response } = await rpcHandler.handle(request, {
        prefix: '/rpc',
        context: {},
      })

      return response ?? new Response('Not Found', { status: 404 })
    },
    '/*': homepage,
  },
  fetch(request, server) {
    if (new URL(request.url).pathname === '/ws') {
      if (server.upgrade(request)) {
        return
      }

      return new Response('Upgrade failed', { status: 500 })
    }
  },
  websocket: {
    message(ws, message) {
      wsHandler.message(ws, message, { context: {} })
    },
    close(ws) {
      wsHandler.close(ws)
    },
  },
})

console.log(
  `omnarr web UI running at http://localhost:${envVariables.OMNARR_PORT}`
)
