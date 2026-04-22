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

  async getById(id: number) {
    return await db
      .selectFrom('media_files as mf')
      .where('mf.id', '=', id)
      .selectAll('mf')
      .executeTakeFirst()
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
        'mf.start_time',
        'mf.duration',
        'mf.episode_id',
        'mf.scanned_at',
        (eb) =>
          eb
            .selectFrom('media_keyframes as mk')
            .innerJoin('media_tracks as mt', 'mt.id', 'mk.track_id')
            .whereRef('mt.media_file_id', '=', 'mf.id')
            .select(eb.fn.countAll<number>().as('count'))
            .as('keyframes'),
        (eb) =>
          eb
            .exists(
              eb
                .selectFrom('media_vad as mv')
                .innerJoin('media_tracks as mt', 'mt.id', 'mv.track_id')
                .whereRef('mt.media_file_id', '=', 'mf.id')
                .selectAll()
            )
            .as('has_vad'),
        (eb) =>
          jsonArrayFrom(
            eb
              .selectFrom('media_tracks as mt')
              .whereRef('mt.media_file_id', '=', 'mf.id')
              .select([
                'mt.id',
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

  async countByMedia(mediaId: string, episodeId?: number | null) {
    let query = db
      .selectFrom('media_files as mf')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .where('mf.media_id', '=', mediaId)

    if (episodeId != null) {
      query = query.where('mf.episode_id', '=', episodeId)
    }

    const result = await query.executeTakeFirstOrThrow()

    return result.count
  },

  async deleteByIds(ids: number[]) {
    if (ids.length === 0) {
      return
    }

    return await db.deleteFrom('media_files').where('id', 'in', ids).execute()
  },

  async getActiveScan(mediaId: string) {
    const scanning = await db
      .selectFrom('media_files as mf')
      .innerJoin('media_tracks as mt', 'mt.media_file_id', 'mf.id')
      .where('mf.media_id', '=', mediaId)
      .where('mt.scan_ratio', 'is not', null)
      .where('mt.scan_ratio', '<', 1)
      .select(['mf.id as file_id', 'mf.path'])
      .limit(1)
      .executeTakeFirst()

    if (!scanning) {
      return null
    }

    const metrics = await db
      .selectFrom('media_tracks as mt')
      .where('mt.media_file_id', '=', scanning.file_id)
      .where('mt.stream_type', 'in', ['video', 'audio'])
      .where('mt.scan_ratio', 'is not', null)
      .select((ib) => ib.fn.avg<number>('mt.scan_ratio').as('ratio'))
      .executeTakeFirstOrThrow()

    return {
      path: scanning.path,
      ratio: metrics.ratio,
    }
  },
}

export type ScanFile = Awaited<
  ReturnType<typeof DbMediaFiles.getWithScanData>
>[number]
