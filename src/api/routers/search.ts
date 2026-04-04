import { os } from '@orpc/server'

import { SearchSchemas } from '@/api/schemas'
import { Search } from '@/core/search'

export const searchRouter = {
  search: os
    .input(SearchSchemas.search)
    .handler(({ input }) => Search.search(input.query)),
}
