import type { Insertable } from '@lobomfz/db'
import { sql } from 'kysely'
import { jsonArrayFrom } from 'kysely/helpers/sqlite'

import { db, media_type, type DB } from '@/db/connection'

export type FullMedia = NonNullable<Awaited<ReturnType<typeof DbMedia.getById>>>

export const DbMedia = {
  async create(data: Insertable<DB['media']>) {
    return await db
      .insertInto('media')
      .values(data)
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          id: (eb) => eb.ref('excluded.id'),
        })
      )
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
        (eb) =>
          eb
            .selectFrom('downloads as d')
            .whereRef('d.media_id', '=', 'm.id')
            .where('d.status', '!=', 'error')
            .orderBy('d.started_at', 'desc')
            .select('d.status')
            .limit(1)
            .as('download_status'),
      ])
      .groupBy('m.id')

    if (filterType) {
      query = query.where('m.media_type', '=', filterType)
    }

    return await query.execute()
  },

  async getInfo(id: string) {
    return await db
      .selectFrom('media as m')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .where('m.id', '=', id)
      .select([
        'm.id',
        'm.media_type',
        'm.added_at',
        't.title',
        't.year',
        (eb) =>
          jsonArrayFrom(
            eb
              .selectFrom('downloads as d')
              .whereRef('d.media_id', '=', 'm.id')
              .select([
                'd.id',
                'd.status',
                'd.progress',
                'd.speed',
                'd.eta',
                'd.content_path',
                'd.error_at',
                'd.started_at',
                (eb2) =>
                  jsonArrayFrom(
                    eb2
                      .selectFrom('media_files as mf')
                      .whereRef('mf.download_id', '=', 'd.id')
                      .select([
                        'mf.id',
                        'mf.path',
                        'mf.size',
                        'mf.format_name',
                        'mf.duration',
                        (eb3) =>
                          jsonArrayFrom(
                            eb3
                              .selectFrom('media_tracks as mt')
                              .whereRef('mt.media_file_id', '=', 'mf.id')
                              .select([
                                'mt.stream_index',
                                'mt.stream_type',
                                'mt.codec_name',
                                'mt.language',
                                'mt.title',
                                'mt.is_default',
                                'mt.path',
                                'mt.width',
                                'mt.height',
                                'mt.channel_layout',
                              ])
                              .orderBy('mt.stream_index')
                          ).as('tracks'),
                      ])
                      .orderBy('mf.path')
                  ).as('files'),
              ])
              .orderBy('d.started_at', 'desc')
          ).as('downloads'),
      ])
      .executeTakeFirst()
  },

  async delete(id: string) {
    return await db
      .deleteFrom('media')
      .where('id', '=', id)
      .returning(['id'])
      .executeTakeFirst()
  },
}
