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
      return
    }

    await executor.insertInto('media_tracks').values(data).execute()
  },

  async getByMediaFileId(mediaFileId: number) {
    return await db
      .selectFrom('media_tracks as mt')
      .where('mt.media_file_id', '=', mediaFileId)
      .selectAll('mt')
      .execute()
  },

  async getByMediaId(mediaId: string) {
    return await db
      .selectFrom('media_tracks as t')
      .innerJoin('media_files as f', 'f.id', 't.media_file_id')
      .where('f.media_id', '=', mediaId)
      .selectAll('t')
      .execute()
  },

  async getWithFile(filter: { media_id: string; episode_id?: number }) {
    let query = db
      .selectFrom('media_tracks as t')
      .innerJoin('media_files as f', 'f.id', 't.media_file_id')
      .where('f.media_id', '=', filter.media_id)
      .select([
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

    if (filter.episode_id !== undefined) {
      query = query.where('f.episode_id', '=', filter.episode_id)
    }

    return await query.execute()
  },
}

export type TracksWithFile = Awaited<
  ReturnType<typeof DbMediaTracks.getWithFile>
>
