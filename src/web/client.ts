import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { RPCLink as WsRPCLink } from '@orpc/client/websocket'
import type { InferRouterOutputs, RouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

import type { API } from '@/api/app'
import type { WsAPI } from '@/api/ws-router'

const client: RouterClient<API> = createORPCClient(
  new RPCLink({
    url: new URL('/rpc', window.location.origin).href,
  })
)

export const orpc = createTanstackQueryUtils(client)

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const wsUrl = `${wsProtocol}//${window.location.host}/ws`

const websocket = new WebSocket(wsUrl)

export const wsClient: RouterClient<WsAPI> = createORPCClient(
  new WsRPCLink({ websocket })
)

export type RouterOutputs = InferRouterOutputs<API>
