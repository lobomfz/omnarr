import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbMediaTracks = {
  async create(data: Insertable<DB['media_tracks']>) {
    return await db
      .insertInto('media_tracks')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow()
  },

  async createMany(data: Insertable<DB['media_tracks']>[], executor = db) {
    if (data.length === 0) {
      return []
    }

    return await executor
      .insertInto('media_tracks')
      .values(data)
      .returningAll()
      .execute()
  },

  async updateScanRatio(trackId: number, ratio: number | null) {
    await db
      .updateTable('media_tracks')
      .set({ scan_ratio: ratio })
      .where('id', '=', trackId)
      .execute()
  },

  async aggregateScanRatioByFile(mediaFileId: number) {
    const row = await db
      .selectFrom('media_tracks as mt')
      .where('mt.media_file_id', '=', mediaFileId)
      .where('mt.stream_type', 'in', ['video', 'audio'])
      .where('mt.scan_ratio', 'is not', null)
      .select((eb) => eb.fn.avg<number>('mt.scan_ratio').as('ratio'))
      .executeTakeFirst()

    return row?.ratio ?? 0
  },

  async getByMediaFileId(mediaFileId: number) {
    return await db
      .selectFrom('media_tracks as mt')
      .where('mt.media_file_id', '=', mediaFileId)
      .selectAll('mt')
      .execute()
  },

  async getById(id: number) {
    return await db
      .selectFrom('media_tracks as mt')
      .where('mt.id', '=', id)
      .selectAll('mt')
      .executeTakeFirst()
  },

  async getByMediaId(mediaId: string) {
    return await db
      .selectFrom('media_tracks as t')
      .innerJoin('media_files as f', 'f.id', 't.media_file_id')
      .where('f.media_id', '=', mediaId)
      .selectAll('t')
      .execute()
  },

  async getWithFile(filter: { media_id: string; episode_id?: number | null }) {
    let query = db
      .selectFrom('media_tracks as t')
      .innerJoin('media_files as f', 'f.id', 't.media_file_id')
      .where('f.media_id', '=', filter.media_id)
      .select([
        't.id',
        't.stream_index',
        't.stream_type',
        't.codec_name',
        't.language',
        't.title',
        't.is_default',
        't.width',
        't.height',
        't.channels',
        't.channel_layout',
        'f.path as file_path',
        'f.id as file_id',
        'f.download_id',
        'f.duration as file_duration',
      ])
      .orderBy('f.download_id', 'desc')
      .orderBy('t.stream_index', 'asc')

    if (filter.episode_id != null) {
      query = query.where('f.episode_id', '=', filter.episode_id)
    }

    return await query.execute()
  },

  async getFileContext(mediaId: string, trackIds: number[]) {
    return await db
      .selectFrom('media_tracks as t')
      .innerJoin('media_files as f', 'f.id', 't.media_file_id')
      .where('t.id', 'in', trackIds)
      .where('f.media_id', '=', mediaId)
      .select(['t.id', 'f.episode_id'])
      .execute()
  },

  async getDefaultAudioVadTrackId(filter: {
    media_id: string
    episode_id?: number | null
  }) {
    let query = db
      .selectFrom('media_tracks as mt')
      .innerJoin('media_vad as mv', 'mv.track_id', 'mt.id')
      .innerJoin('media_files as mf', 'mf.id', 'mt.media_file_id')
      .where('mf.media_id', '=', filter.media_id)
      .where('mt.stream_type', '=', 'audio')
      .orderBy('mt.is_default', 'desc')
      .orderBy('mt.stream_index', 'asc')
      .select('mt.id')

    if (filter.episode_id != null) {
      query = query.where('mf.episode_id', '=', filter.episode_id)
    }

    const result = await query.executeTakeFirst()

    return result?.id
  },

  async getDefaultVideoReleaseName(filter: {
    media_id: string
    episode_id?: number | null
  }) {
    let query = db
      .selectFrom('media_tracks as mt')
      .innerJoin('media_files as mf', 'mf.id', 'mt.media_file_id')
      .innerJoin('downloads as d', 'd.id', 'mf.download_id')
      .leftJoin('releases as r', 'r.source_id', 'd.source_id')
      .where('mf.media_id', '=', filter.media_id)
      .where('mt.stream_type', '=', 'video')
      .where('mt.is_default', '=', true)
      .select('r.name')

    if (filter.episode_id != null) {
      query = query.where('mf.episode_id', '=', filter.episode_id)
    }

    const result = await query.executeTakeFirst()

    return result?.name
  },
}

export type TracksWithFile = Awaited<
  ReturnType<typeof DbMediaTracks.getWithFile>
>
