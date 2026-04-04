import { os } from '@orpc/server'

import { DownloadSchemas } from '@/api/schemas'
import { Downloads } from '@/core/downloads'
import { DbDownloads } from '@/db/downloads'

export const downloadsRouter = {
  list: os
    .input(DownloadSchemas.list)
    .handler(({ input }) => DbDownloads.list(input.limit)),

  listActive: os.handler(() => DbDownloads.listActiveWithMedia()),

  add: os
    .input(DownloadSchemas.add)
    .handler(({ input }) => new Downloads().enqueue(input)),
}
