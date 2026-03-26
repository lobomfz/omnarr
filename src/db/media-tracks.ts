import type { Insertable, Updateable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbMediaTracks = {
  async create(data: Insertable<DB['media_tracks']>) {
    return await db
      .insertInto('media_tracks')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow()
  },

  async createMany(data: Insertable<DB['media_tracks']>[]) {
    if (data.length === 0) {
      return
    }

    await db.insertInto('media_tracks').values(data).execute()
  },

  async getByMediaFileId(mediaFileId: number) {
    return await db
      .selectFrom('media_tracks')
      .where('media_file_id', '=', mediaFileId)
      .selectAll()
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

  async getWithFileByMediaId(mediaId: string) {
    return await db
      .selectFrom('media_tracks as t')
      .innerJoin('media_files as f', 'f.id', 't.media_file_id')
      .where('f.media_id', '=', mediaId)
      .select([
        't.stream_index',
        't.stream_type',
        't.codec_name',
        't.language',
        't.title',
        't.is_default',
        't.width',
        't.height',
        't.channel_layout',
        'f.path as file_path',
        'f.id as file_id',
        'f.download_id',
        'f.duration as file_duration',
      ])
      .orderBy('f.download_id', 'desc')
      .orderBy('t.stream_index', 'asc')
      .execute()
  },

  async update(id: number, data: Updateable<DB['media_tracks']>) {
    return await db
      .updateTable('media_tracks')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()
  },
}
