import { config } from '@/config'
import { media_type } from '@/db/connection'
import { DbReleases } from '@/db/releases'
import { indexerMap } from '@/integrations/indexers/registry'
import { TmdbClient } from '@/integrations/tmdb/client'

export const Releases = {
  async fetch(tmdb_id: number, type: media_type) {
    const externalIds = await new TmdbClient().getExternalIds(tmdb_id, type)

    if (!externalIds.imdb_id) {
      throw new Error('No IMDB ID found for this media.')
    }

    const indexers = config.indexers.map((c) => new indexerMap[c.type](c))

    if (indexers.length === 0) {
      throw new Error('No indexers configured.')
    }

    const results = await Promise.all(
      indexers.map((i) =>
        i.search({
          tmdb_id: String(tmdb_id),
          imdb_id: externalIds.imdb_id!,
        })
      )
    )

    return results.flat()
  },

  async search(tmdb_id: number, type: media_type) {
    const releases = await this.fetch(tmdb_id, type)

    return await DbReleases.upsert(tmdb_id, type, releases)
  },
}
