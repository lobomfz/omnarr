import type { Insertable } from '@lobomfz/db'
import { sql } from 'kysely'

import { db, media_type, type DB } from '@/db/connection'

export type FullMedia = NonNullable<Awaited<ReturnType<typeof DbMedia.getById>>>

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

  async getById(id: string) {
    return await db
      .selectFrom('media as m')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .where('m.id', '=', id)
      .select(['m.root_folder', 'm.media_type', 't.title', 't.year'])
      .executeTakeFirst()
  },

  async list(filterType?: media_type) {
    let query = db
      .selectFrom('media as m')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .leftJoin('media_files as mf', 'mf.media_id', 'm.id')
      .leftJoin('media_tracks as mt', 'mt.media_file_id', 'mf.id')
      .select([
        'm.id',
        'm.media_type',
        't.title',
        't.year',
        sql<number>`count(distinct mf.id)`.as('file_count'),
        sql<number>`count(mt.id)`.as('track_count'),
        sql<number>`count(mt.path)`.as('extracted_count'),
      ])
      .groupBy('m.id')

    if (filterType) {
      query = query.where('m.media_type', '=', filterType)
    }

    return await query.execute()
  },

  async delete(id: string) {
    return await db
      .deleteFrom('media')
      .where('id', '=', id)
      .returning(['id'])
      .executeTakeFirst()
  },
}
