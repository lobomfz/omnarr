import { os } from '@orpc/server'

import { TmdbSchemas } from '@/api/schemas'
import { Tmdb } from '@/core/tmdb'

export const tmdbRouter = {
  search: os
    .input(TmdbSchemas.search)
    .handler(({ input }) => Tmdb.search(input.query)),

  getInfo: os
    .input(TmdbSchemas.getInfo)
    .handler(({ input }) => Tmdb.getInfo(input.id)),
}
