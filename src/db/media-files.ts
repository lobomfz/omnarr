import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbMediaFiles = {
  async create(data: Insertable<DB['media_files']>) {
    return await db
      .insertInto('media_files')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow()
  },

  async getByMediaId(mediaId: number) {
    return await db
      .selectFrom('media_files')
      .where('media_id', '=', mediaId)
      .selectAll()
      .execute()
  },

  async getByPath(path: string) {
    return await db
      .selectFrom('media_files')
      .where('path', '=', path)
      .selectAll()
      .executeTakeFirst()
  },

  async deleteByMediaId(mediaId: number) {
    return await db
      .deleteFrom('media_files')
      .where('media_id', '=', mediaId)
      .execute()
  },

  async deleteById(id: number) {
    return await db.deleteFrom('media_files').where('id', '=', id).execute()
  },
}
