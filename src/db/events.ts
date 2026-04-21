import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbEvents = {
  async create(data: Insertable<DB['events']>) {
    return await db
      .insertInto('events')
      .values(data)
      .returning([
        'id',
        'media_id',
        'entity_type',
        'entity_id',
        'event_type',
        'message',
        'metadata',
        'read',
        'created_at',
      ])
      .executeTakeFirstOrThrow()
  },

  async createBatch(data: Insertable<DB['events']>[]) {
    if (data.length === 0) {
      return
    }

    await db.insertInto('events').values(data).execute()
  },

  async getByMediaId(mediaId: string) {
    return await db
      .selectFrom('events as e')
      .where('e.media_id', '=', mediaId)
      .select([
        'e.id',
        'e.entity_type',
        'e.entity_id',
        'e.event_type',
        'e.message',
        'e.metadata',
        'e.read',
        'e.created_at',
      ])
      .orderBy('e.id', 'desc')
      .execute()
  },

  async deleteScanErrors(mediaId: string) {
    await db
      .deleteFrom('events')
      .where('media_id', '=', mediaId)
      .where('entity_type', '=', 'scan')
      .where('event_type', '=', 'file_error')
      .execute()
  },

  async markRead(ids: number[]) {
    if (ids.length === 0) {
      return 0
    }

    const result = await db
      .updateTable('events as e')
      .set({ read: true })
      .where('e.id', 'in', ids)
      .executeTakeFirstOrThrow()

    return Number(result.numUpdatedRows)
  },
}
