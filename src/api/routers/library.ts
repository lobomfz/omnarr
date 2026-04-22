import { os } from '@orpc/server'

import { LibrarySchemas, ScanSchemas } from '@/api/schemas'
import { MediaResolver } from '@/core/media-resolver'
import { Scanner } from '@/core/scanner'
import { DbMedia } from '@/db/media'
import { errors } from '@/shared/errors'

export const libraryRouter = {
  list: os
    .input(LibrarySchemas.list)
    .handler(({ input }) => DbMedia.list(input)),

  spotlight: os.handler(() => DbMedia.spotlight()),

  getInfo: os
    .input(LibrarySchemas.getInfo)
    .errors(errors(['SEARCH_RESULT_NOT_FOUND']))
    .handler(({ input }) => new MediaResolver(input).resolve()),

  rescan: os
    .input(ScanSchemas.rescan)
    .errors(errors(['MEDIA_NOT_FOUND']))
    .handler(({ input }) => new Scanner().rescan(input)),
}
