import { RPCHandler } from '@orpc/server/fetch'

import { router } from '@/api/router'
import { Log } from '@/lib/log'

export const rpcHandler = new RPCHandler(router, {
  interceptors: [
    async ({ request, next }) => {
      try {
        return await next()
      } catch (error: any) {
        const endpoint = request.url.pathname.replace('/rpc/', '')

        Log.error(`rpc endpoint="${endpoint}" error="${error.message}"`)

        throw error
      }
    },
  ],
})

export type API = typeof router
