import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'
import type { RouterClient } from '@orpc/server'

import type { WsAPI } from '@/api/ws-router'
import { envVariables } from '@/lib/env'

export function connectWs() {
  const websocket = new WebSocket(
    `ws://localhost:${envVariables.OMNARR_PORT}/ws`
  )

  const wsClient: RouterClient<WsAPI> = createORPCClient(
    new RPCLink({ websocket })
  )

  return wsClient
}
