import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbMediaEnvelopes = {
  async create(data: Insertable<DB['media_envelopes']>) {
    await db.insertInto('media_envelopes').values(data).execute()
  },

  async getByMediaFileId(mediaFileId: number) {
    return await db
      .selectFrom('media_envelopes as me')
      .where('me.media_file_id', '=', mediaFileId)
      .selectAll('me')
      .executeTakeFirst()
  },
}
