import { os } from '@orpc/server'

import { LibrarySchemas, ScanSchemas } from '@/api/schemas'
import { Scanner } from '@/core/scanner'
import { DbMedia } from '@/db/media'

export const libraryRouter = {
  list: os
    .input(LibrarySchemas.list)
    .handler(({ input }) => DbMedia.list(input)),

  getInfo: os
    .input(LibrarySchemas.getInfo)
    .handler(({ input }) => DbMedia.getInfo(input.id, input)),

  rescan: os
    .input(ScanSchemas.rescan)
    .handler(({ input }) => new Scanner().rescan(input.media_id, input.force)),
}
