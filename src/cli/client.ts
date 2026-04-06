import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'

import type { API } from '@/api/app'
import { envVariables } from '@/lib/env'

export const client: RouterClient<API> = createORPCClient(
  new RPCLink({
    url: `http://localhost:${envVariables.OMNARR_PORT}/rpc`,
  })
)
