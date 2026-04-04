import type { media_type } from '@/db/connection'
import { db, type indexer_source } from '@/db/connection'
import type { IndexerRelease } from '@/integrations/indexers/types'
import { deriveId } from '@/lib/utils'

interface SourcedRelease extends IndexerRelease {
  name: string
  indexer_source: indexer_source
  season_number?: number | null
  episode_number?: number | null
}

export type Release = NonNullable<
  Awaited<ReturnType<typeof DbReleases.getById>>
>

export const DbReleases = {
  async upsert(
    tmdb_id: number,
    media_type: media_type,
    releases: SourcedRelease[]
  ) {
    if (releases.length === 0) {
      return []
    }

    return await db
      .insertInto('releases')
      .values(
        releases.map((r) => ({
          id: deriveId(r.source_id),
          tmdb_id,
          media_type,
          source_id: r.source_id,
          indexer_source: r.indexer_source,
          name: r.name,
          size: r.size,
          seeders: r.seeders,
          imdb_id: r.imdb_id,
          resolution: r.resolution,
          codec: r.codec,
          hdr: r.hdr.join('/'),
          download_url: r.download_url,
          language: r.language,
          season_number: r.season_number,
          episode_number: r.episode_number,
        }))
      )
      .onConflict((oc) =>
        oc.column('source_id').doUpdateSet({
          indexer_source: (eb) => eb.ref('excluded.indexer_source'),
          name: (eb) => eb.ref('excluded.name'),
          size: (eb) => eb.ref('excluded.size'),
          seeders: (eb) => eb.ref('excluded.seeders'),
          imdb_id: (eb) => eb.ref('excluded.imdb_id'),
          resolution: (eb) => eb.ref('excluded.resolution'),
          codec: (eb) => eb.ref('excluded.codec'),
          hdr: (eb) => eb.ref('excluded.hdr'),
          download_url: (eb) => eb.ref('excluded.download_url'),
          language: (eb) => eb.ref('excluded.language'),
          season_number: (eb) => eb.ref('excluded.season_number'),
          episode_number: (eb) => eb.ref('excluded.episode_number'),
        })
      )
      .returning([
        'id',
        'source_id',
        'indexer_source',
        'name',
        'size',
        'seeders',
        'resolution',
        'codec',
        'hdr',
        'download_url',
        'language',
        'season_number',
        'episode_number',
      ])
      .execute()
  },

  async getById(id: string) {
    return await db
      .selectFrom('releases as r')
      .where('r.id', '=', id)
      .select([
        'r.id',
        'r.tmdb_id',
        'r.media_type',
        'r.source_id',
        'r.indexer_source',
        'r.download_url',
        'r.name',
        'r.language',
        'r.season_number',
        'r.episode_number',
      ])
      .executeTakeFirst()
  },
}
