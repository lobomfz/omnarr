import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'
import { deriveId } from '@/utils'

export const DbSearchResults = {
  async upsert(results: Omit<Insertable<DB['search_results']>, 'id'>[]) {
    if (results.length === 0) {
      return []
    }

    return await db
      .insertInto('search_results')
      .values(
        results.map((r) => ({
          id: deriveId(`${r.tmdb_id}:${r.media_type}`),
          tmdb_id: r.tmdb_id,
          media_type: r.media_type,
          title: r.title,
          year: r.year,
        }))
      )
      .onConflict((oc) =>
        oc.columns(['tmdb_id', 'media_type']).doUpdateSet({
          title: (eb) => eb.ref('excluded.title'),
          year: (eb) => eb.ref('excluded.year'),
        })
      )
      .returning(['id', 'tmdb_id', 'media_type', 'title', 'year'])
      .execute()
  },

  async getById(id: string) {
    return await db
      .selectFrom('search_results as sr')
      .where('sr.id', '=', id)
      .select(['sr.tmdb_id', 'sr.media_type'])
      .executeTakeFirst()
  },
}
