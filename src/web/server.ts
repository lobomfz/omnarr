import '@/api/arktype'
import '@/jobs/workers/ripper'
import '@/jobs/workers/scan'
import '@/jobs/workers/subtitle-match'
import { rpcHandler } from '@/api/app'
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
})

console.log(
  `omnarr web UI running at http://localhost:${envVariables.OMNARR_PORT}`
)
