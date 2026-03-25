import type { Insertable } from '@lobomfz/db'

import { db, media_type, type DB } from '@/db/connection'

export const DbMedia = {
  async create(data: Insertable<DB['media']>) {
    return await db
      .insertInto('media')
      .values(data)
      .returning([
        'id',
        'tmdb_media_id',
        'media_type',
        'root_folder',
        'has_file',
        'added_at',
      ])
      .executeTakeFirstOrThrow()
  },

  async getById(id: number) {
    return await db
      .selectFrom('media as m')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .where('m.id', '=', id)
      .select(['m.root_folder', 'm.media_type', 't.title', 't.year'])
      .executeTakeFirst()
  },

  async list(type?: media_type) {
    let query = db
      .selectFrom('media as m')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .select(['t.title'])

    if (type) {
      query = query.where('m.media_type', '=', type)
    }

    return await query.execute()
  },

  async delete(id: number) {
    return await db
      .deleteFrom('media')
      .where('id', '=', id)
      .returning(['id'])
      .executeTakeFirst()
  },
}
