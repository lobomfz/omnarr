import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbMediaVad = {
  async create(data: Insertable<DB['media_vad']>, executor = db) {
    await executor.insertInto('media_vad').values(data).execute()
  },

  async getByTrackId(trackId: number) {
    return await db
      .selectFrom('media_vad as mv')
      .where('mv.track_id', '=', trackId)
      .selectAll('mv')
      .executeTakeFirst()
  },

  async loadVad(trackId: number) {
    const vad = await DbMediaVad.getByTrackId(trackId)

    if (!vad) {
      return null
    }

    return new Float32Array(
      vad.data.buffer,
      vad.data.byteOffset,
      vad.data.byteLength / Float32Array.BYTES_PER_ELEMENT
    )
  },
}
