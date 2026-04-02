import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbMediaVad = {
  async create(data: Insertable<DB['media_vad']>, executor = db) {
    await executor.insertInto('media_vad').values(data).execute()
  },

  async getByMediaFileId(mediaFileId: number) {
    return await db
      .selectFrom('media_vad as mv')
      .where('mv.media_file_id', '=', mediaFileId)
      .selectAll('mv')
      .executeTakeFirst()
  },
}
