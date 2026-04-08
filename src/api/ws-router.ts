import { os } from '@orpc/server'

import { PubSub } from '@/api/pubsub'

export const wsRouter = {
  downloadProgress: os.handler(({ signal }) =>
    PubSub.subscribe('download_progress', signal)
  ),

  scanProgress: os.handler(({ signal }) =>
    PubSub.subscribe('scan_progress', signal)
  ),

  subtitleProgress: os.handler(({ signal }) =>
    PubSub.subscribe('subtitle_progress', signal)
  ),
}

export type WsAPI = typeof wsRouter
