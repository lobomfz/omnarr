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

  async getByMediaFileId(mediaFileId: number) {
    return await db
      .selectFrom('media_tracks')
      .where('media_file_id', '=', mediaFileId)
      .selectAll()
      .execute()
  },

  async getByMediaId(mediaId: number) {
    return await db
      .selectFrom('media_tracks as t')
      .innerJoin('media_files as f', 'f.id', 't.media_file_id')
      .where('f.media_id', '=', mediaId)
      .selectAll('t')
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

  async getUnextracted(mediaId: number) {
    return await db
      .selectFrom('media_tracks as t')
      .innerJoin('media_files as f', 'f.id', 't.media_file_id')
      .where('f.media_id', '=', mediaId)
      .where('t.path', 'is', null)
      .selectAll('t')
      .execute()
  },
}
