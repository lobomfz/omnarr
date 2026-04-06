import { RPCHandler } from '@orpc/server/fetch'

import { router } from '@/api/router'

export const rpcHandler = new RPCHandler(router)

export type API = typeof router
