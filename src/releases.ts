import { config } from '@/config'
import { media_type } from '@/db/connection'
import { DbReleases } from '@/db/releases'
import { indexerMap } from '@/integrations/indexers/registry'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Log } from '@/log'

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

    await Log.info(
      `fetching releases tmdb_id=${tmdb_id} type=${type} indexers=${indexers.length}`
    )

    const results = await Promise.all(
      indexers.map(async (i) => {
        await Log.info(
          `searching indexer=${i.constructor.name} imdb_id=${externalIds.imdb_id}`
        )

        return await i
          .search({
            tmdb_id: String(tmdb_id),
            imdb_id: externalIds.imdb_id!,
          })
          .then(async (r) => {
            await Log.info(
              `indexer=${i.constructor.name} returned ${r.length} results`
            )
            return r
          })
          .catch(async (err) => {
            await Log.warn(
              `indexer=${i.constructor.name} failed error="${err.message}"`
            )
            return []
          })
      })
    )

    return results.flat()
  },

  async search(tmdb_id: number, type: media_type) {
    const releases = await this.fetch(tmdb_id, type)

    const persisted = await DbReleases.upsert(tmdb_id, type, releases)

    await Log.info(`releases persisted count=${persisted.length}`)

    return persisted
  },
}
