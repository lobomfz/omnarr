import { type Insertable, jsonArrayFrom } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbMediaFiles = {
  async create(data: Insertable<DB['media_files']>, executor = db) {
    return await executor
      .insertInto('media_files')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow()
  },

  async getByMediaId(mediaId: string) {
    return await db
      .selectFrom('media_files as mf')
      .where('mf.media_id', '=', mediaId)
      .selectAll('mf')
      .execute()
  },

  async getByPath(path: string) {
    return await db
      .selectFrom('media_files as mf')
      .where('mf.path', '=', path)
      .selectAll('mf')
      .executeTakeFirst()
  },

  async deleteByMediaId(mediaId: string) {
    const result = await db
      .deleteFrom('media_files')
      .where('media_id', '=', mediaId)
      .executeTakeFirstOrThrow()

    return Number(result.numDeletedRows)
  },

  async getWithScanData(mediaId: string) {
    return await db
      .selectFrom('media_files as mf')
      .where('mf.media_id', '=', mediaId)
      .select([
        'mf.id',
        'mf.media_id',
        'mf.download_id',
        'mf.path',
        'mf.size',
        'mf.format_name',
        'mf.duration',
        'mf.episode_id',
        'mf.scanned_at',
        (eb) =>
          eb
            .selectFrom('media_keyframes as mk')
            .whereRef('mk.media_file_id', '=', 'mf.id')
            .select(eb.fn.countAll<number>().as('count'))
            .as('keyframes'),
        (eb) =>
          eb
            .exists(
              eb
                .selectFrom('media_vad as mv')
                .whereRef('mv.media_file_id', '=', 'mf.id')
                .selectAll()
            )
            .as('has_vad'),
        (eb) =>
          jsonArrayFrom(
            eb
              .selectFrom('media_tracks as mt')
              .whereRef('mt.media_file_id', '=', 'mf.id')
              .select([
                'mt.stream_index',
                'mt.stream_type',
                'mt.codec_name',
                'mt.language',
                'mt.title',
                'mt.is_default',
                'mt.width',
                'mt.height',
                'mt.channel_layout',
              ])
              .orderBy('mt.stream_index')
          ).as('tracks'),
      ])
      .orderBy('mf.path')
      .execute()
  },

  async deleteByIds(ids: number[]) {
    if (ids.length === 0) {
      return
    }

    return await db.deleteFrom('media_files').where('id', 'in', ids).execute()
  },
}

export type ScanFile = Awaited<
  ReturnType<typeof DbMediaFiles.getWithScanData>
>[number]
