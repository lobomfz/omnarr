import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbSeasons = {
  async listByTmdbId(tmdbId: number) {
    return await db
      .selectFrom('seasons as s')
      .innerJoin('tmdb_media as t', 't.id', 's.tmdb_media_id')
      .where('t.tmdb_id', '=', tmdbId)
      .select(['s.season_number', 's.title', 's.episode_count'])
      .orderBy('s.season_number')
      .execute()
  },

  async upsert(seasons: Insertable<DB['seasons']>[], executor = db) {
    if (seasons.length === 0) {
      return []
    }

    return await executor
      .insertInto('seasons')
      .values(seasons)
      .onConflict((oc) =>
        oc.columns(['tmdb_media_id', 'season_number']).doUpdateSet({
          title: (eb) => eb.ref('excluded.title'),
          episode_count: (eb) => eb.ref('excluded.episode_count'),
          updated_at: new Date(),
        })
      )
      .returning([
        'id',
        'tmdb_media_id',
        'season_number',
        'title',
        'episode_count',
      ])
      .execute()
  },
}
