import type { Insertable, Updateable } from '@lobomfz/db'
import dayjs from 'dayjs'

import { db, type DB } from '@/db/connection'

export const DbDownloads = {
  async create(data: Insertable<DB['downloads']>) {
    return await db
      .insertInto('downloads')
      .values(data)
      .returning([
        'id',
        'media_id',
        'info_hash',
        'download_url',
        'progress',
        'speed',
        'eta',
        'status',
        'error_at',
        'started_at',
      ])
      .executeTakeFirstOrThrow()
  },

  async getByMediaId(mediaId: string) {
    return await db
      .selectFrom('downloads as d')
      .where('d.media_id', '=', mediaId)
      .select(['d.info_hash'])
      .executeTakeFirst()
  },

  async getByInfoHash(infoHash: string) {
    return await db
      .selectFrom('downloads as d')
      .innerJoin('media as m', 'm.id', 'd.media_id')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .where('d.info_hash', '=', infoHash)
      .select(['d.status', 't.title', 't.year'])
      .executeTakeFirst()
  },

  async listActive() {
    const cutoff = dayjs().subtract(24, 'hours').toDate()

    return await db
      .selectFrom('downloads as d')
      .where((eb) =>
        eb.or([
          eb('d.status', 'in', ['downloading', 'seeding', 'paused']),
          eb('d.started_at', '>=', cutoff),
        ])
      )
      .select([
        'd.id',
        'd.media_id',
        'd.info_hash',
        'd.download_url',
        'd.progress',
        'd.content_path',
        'd.error_at',
      ])
      .execute()
  },

  async list(limit: number) {
    return await db
      .selectFrom('downloads as d')
      .innerJoin('media as m', 'm.id', 'd.media_id')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .leftJoin('releases as r', 'r.info_hash', 'd.info_hash')
      .select([
        'd.progress',
        'd.speed',
        'd.eta',
        'd.status',
        't.title',
        't.year',
        'r.indexer_source',
      ])
      .orderBy('d.started_at', 'desc')
      .limit(limit)
      .execute()
  },

  async update(id: number, data: Updateable<DB['downloads']>) {
    return await db
      .updateTable('downloads')
      .set(data)
      .where('id', '=', id)
      .returning(['id', 'progress', 'speed', 'eta', 'status'])
      .executeTakeFirst()
  },

  async batchUpdate(rows: Insertable<DB['downloads']>[]) {
    if (rows.length === 0) {
      return 0
    }

    const result = await db
      .insertInto('downloads')
      .values(rows)
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          progress: (eb) => eb.ref('excluded.progress'),
          speed: (eb) => eb.ref('excluded.speed'),
          eta: (eb) => eb.ref('excluded.eta'),
          status: (eb) => eb.ref('excluded.status'),
          content_path: (eb) => eb.ref('excluded.content_path'),
          error_at: (eb) => eb.ref('excluded.error_at'),
        })
      )
      .executeTakeFirstOrThrow()

    return Number(result.numInsertedOrUpdatedRows)
  },

  async deleteStaleErrors() {
    const cutoff = dayjs().subtract(24, 'hours').toISOString()

    const result = await db
      .deleteFrom('downloads')
      .where('status', '=', 'error')
      .where('error_at', '<=', cutoff)
      .executeTakeFirstOrThrow()

    return Number(result.numDeletedRows)
  },

  async getCompletedDownloads(mediaId: string) {
    return await db
      .selectFrom('downloads')
      .where('media_id', '=', mediaId)
      .where('status', '=', 'completed')
      .where('content_path', 'is not', null)
      .select(['id', 'content_path'])
      .$narrowType<{ content_path: string }>()
      .execute()
  },

  async deleteByMediaId(mediaId: string) {
    return await db
      .deleteFrom('downloads')
      .where('media_id', '=', mediaId)
      .execute()
  },
}
