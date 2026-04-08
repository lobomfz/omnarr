import { os } from '@orpc/server'

import { DownloadSchemas } from '@/api/schemas'
import { Downloads } from '@/core/downloads'
import { DbDownloads } from '@/db/downloads'

export const downloadsRouter = {
  list: os
    .input(DownloadSchemas.list)
    .handler(({ input }) => DbDownloads.list(input.limit)),

  listInProgress: os.handler(() => DbDownloads.listInProgress()),

  add: os
    .input(DownloadSchemas.add)
    .errors({ TORRENT_REJECTED: {}, DUPLICATE_DOWNLOAD: {}, NO_EPISODES: {} })
    .handler(({ input }) => new Downloads().enqueue(input)),
}
