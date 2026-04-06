import { RPCHandler } from '@orpc/server/bun-ws'

import { wsRouter } from '@/api/ws-router'

export const wsHandler = new RPCHandler(wsRouter)
