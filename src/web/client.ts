import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { RPCLink as WsRPCLink } from '@orpc/client/websocket'
import type { InferRouterOutputs, RouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

import type { API } from '@/api/app'
import type { WsAPI } from '@/api/ws-router'

const httpClient: RouterClient<API> = createORPCClient(
  new RPCLink({
    url: new URL('/rpc', window.location.origin).href,
  })
)

const wsUrl = new URL('/ws', window.location.origin)
wsUrl.protocol = wsUrl.protocol.replace('http', 'ws')

const wsClient: RouterClient<WsAPI> = createORPCClient(
  new WsRPCLink({ websocket: new WebSocket(wsUrl) })
)

export const orpc = createTanstackQueryUtils(httpClient)
export const orpcWs = createTanstackQueryUtils(wsClient)

export type RouterOutputs = InferRouterOutputs<API>
