import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbMediaKeyframes = {
  async createBatch(data: Insertable<DB['media_keyframes']>[]) {
    if (data.length === 0) {
      return
    }

    await db.insertInto('media_keyframes').values(data).execute()
  },

  async getByFileId(mediaFileId: number) {
    return await db
      .selectFrom('media_keyframes')
      .where('media_file_id', '=', mediaFileId)
      .selectAll()
      .orderBy('pts_time', 'asc')
      .execute()
  },
}
