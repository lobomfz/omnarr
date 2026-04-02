import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { InferRouterOutputs, RouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

import type { API } from '@/api/app'

const client: RouterClient<API> = createORPCClient(
  new RPCLink({
    url: new URL('/rpc', window.location.origin).href,
  })
)

export const orpc = createTanstackQueryUtils(client)

export type RouterOutputs = InferRouterOutputs<API>
