import '@/api/arktype'
import { rpcHandler } from '@/api/app'
import { wsHandler } from '@/api/ws-app'
import { envVariables } from '@/lib/env'

const API_SERVER = Symbol.for('omnarr.tests.api-server')

if (!Reflect.get(globalThis, API_SERVER)) {
  Reflect.set(
    globalThis,
    API_SERVER,
    Bun.serve({
      port: envVariables.OMNARR_PORT,
      async fetch(request, server) {
        const url = new URL(request.url)

        if (url.pathname === '/ws') {
          if (server.upgrade(request)) {
            return
          }

          return new Response('Upgrade failed', { status: 500 })
        }

        if (url.pathname.startsWith('/rpc')) {
          const { response } = await rpcHandler.handle(request, {
            prefix: '/rpc',
            context: {},
          })

          return response ?? new Response('Not Found', { status: 404 })
        }

        return new Response('Not Found', { status: 404 })
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
  )
}
