import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbMediaKeyframes = {
  async createBatch(data: Insertable<DB['media_keyframes']>[], executor = db) {
    if (data.length === 0) {
      return
    }

    await executor.insertInto('media_keyframes').values(data).execute()
  },

  async getSegmentsByFileId(mediaFileId: number) {
    return await db
      .selectFrom('media_keyframes as mk')
      .where('mk.media_file_id', '=', mediaFileId)
      .select(['mk.pts_time', 'mk.duration'])
      .orderBy('mk.pts_time', 'asc')
      .execute()
  },
}
