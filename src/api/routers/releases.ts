import { os } from '@orpc/server'

import { ReleasesSchemas } from '@/api/schemas'
import { Releases } from '@/core/releases'

export const releasesRouter = {
  search: os
    .input(ReleasesSchemas.search)
    .errors({
      NO_INDEXERS: {},
      NO_IMDB_ID: {},
      TMDB_UNAVAILABLE: {},
    })
    .handler(({ input }) =>
      new Releases().search(input.tmdb_id, input.media_type, {
        season: input.season_number,
      })
    ),

  searchSingle: os
    .input(ReleasesSchemas.searchSingle)
    .errors({
      NO_INDEXERS: {},
      NO_IMDB_ID: {},
    })
    .handler(({ input }) =>
      new Releases().searchSingle(
        input.tmdb_id,
        input.media_type,
        input.indexer_source,
        { season: input.season_number }
      )
    ),
}
