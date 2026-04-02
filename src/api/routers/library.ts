import { os } from '@orpc/server'

import { LibrarySchemas } from '@/api/schemas'
import { DbMedia } from '@/db/media'

export const libraryRouter = {
  list: os
    .input(LibrarySchemas.list)
    .handler(({ input }) => DbMedia.list(input)),
}
