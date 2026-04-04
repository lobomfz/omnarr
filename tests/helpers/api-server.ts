import '@/api/arktype'
import { rpcHandler } from '@/api/app'
import { envVariables } from '@/lib/env'

Bun.serve({
  port: envVariables.OMNARR_PORT,
  async fetch(request) {
    const { response } = await rpcHandler.handle(request, {
      prefix: '/rpc',
      context: {},
    })

    return response ?? new Response('Not Found', { status: 404 })
  },
})
