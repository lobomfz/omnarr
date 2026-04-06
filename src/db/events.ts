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

  async getUnreadByMediaId(mediaId: string) {
    return await db
      .selectFrom('events as e')
      .where('e.media_id', '=', mediaId)
      .where('e.read', '=', false)
      .select([
        'e.id',
        'e.entity_type',
        'e.entity_id',
        'e.event_type',
        'e.message',
        'e.metadata',
        'e.created_at',
      ])
      .orderBy('e.id', 'desc')
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
