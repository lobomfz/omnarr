import type { Insertable } from '@lobomfz/db'

import { db, media_type, type DB } from '@/db/connection'

export const DbTmdbMedia = {
  async upsert(data: Insertable<DB['tmdb_media']>) {
    return await db
      .insertInto('tmdb_media')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['tmdb_id', 'media_type']).doUpdateSet({
          title: data.title,
          year: data.year,
          overview: data.overview,
          poster_path: data.poster_path,
        })
      )
      .returning([
        'id',
        'tmdb_id',
        'media_type',
        'title',
        'year',
        'overview',
        'poster_path',
        'fetched_at',
      ])
      .executeTakeFirstOrThrow()
  },

  async getByTmdbId(tmdbId: number, mediaType: media_type) {
    return await db
      .selectFrom('tmdb_media as t')
      .where('t.tmdb_id', '=', tmdbId)
      .where('t.media_type', '=', mediaType)
      .select([
        't.id',
        't.title',
        (eb) =>
          eb
            .selectFrom('seasons as s')
            .whereRef('s.tmdb_media_id', '=', 't.id')
            .select(['s.updated_at'])
            .orderBy('s.updated_at', 'desc')
            .limit(1)
            .as('seasons_updated_at'),
      ])
      .executeTakeFirst()
  },

  async getById(id: number) {
    return await db
      .selectFrom('tmdb_media as t')
      .where('t.id', '=', id)
      .select(['t.title'])
      .executeTakeFirst()
  },
}
