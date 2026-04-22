import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'
import type { RouterClient } from '@orpc/server'

import type { WsAPI } from '@/api/ws-router'
import { envVariables } from '@/lib/env'

export const wsClient: RouterClient<WsAPI> = createORPCClient(
  new RPCLink({
    websocket: new WebSocket(`ws://localhost:${envVariables.OMNARR_PORT}/ws`),
  })
)
