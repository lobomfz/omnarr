import { type Insertable, type Updateable } from '@lobomfz/db'
import dayjs from 'dayjs'

import { db, type DB, type download_status } from '@/db/connection'

const IN_PROGRESS_STATUSES: download_status[] = [
  'downloading',
  'pending',
  'processing',
]

export const DbDownloads = {
  async create(data: Insertable<DB['downloads']>) {
    return await db
      .insertInto('downloads')
      .values(data)
      .returning([
        'id',
        'media_id',
        'source_id',
        'download_url',
        'progress',
        'speed',
        'eta',
        'source',
        'status',
        'error_at',
        'season_number',
        'episode_number',
        'started_at',
      ])
      .executeTakeFirstOrThrow()
  },

  async getById(id: number) {
    return await db
      .selectFrom('downloads as d')
      .where('d.id', '=', id)
      .select([
        'd.id',
        'd.media_id',
        'd.source_id',
        'd.download_url',
        'd.source',
        'd.status',
        'd.season_number',
        'd.episode_number',
      ])
      .executeTakeFirst()
  },

  async getByMediaId(mediaId: string) {
    return await db
      .selectFrom('downloads as d')
      .where('d.media_id', '=', mediaId)
      .select(['d.source_id'])
      .executeTakeFirst()
  },

  async getBySourceId(sourceId: string) {
    return await db
      .selectFrom('downloads as d')
      .innerJoin('media as m', 'm.id', 'd.media_id')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .where('d.source_id', '=', sourceId)
      .select(['d.status', 't.title', 't.year'])
      .executeTakeFirst()
  },

  async listForSync() {
    const cutoff = dayjs().subtract(24, 'hours').toDate()

    return await db
      .selectFrom('downloads as d')
      .where('d.source', '=', 'torrent')
      .where('d.status', '!=', 'completed')
      .where((eb) =>
        eb.or([
          eb('d.status', 'in', ['downloading', 'seeding', 'paused']),
          eb('d.started_at', '>=', cutoff),
        ])
      )
      .select([
        'd.id',
        'd.media_id',
        'd.source_id',
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
      .leftJoin('releases as r', 'r.source_id', 'd.source_id')
      .select([
        'd.progress',
        'd.speed',
        'd.eta',
        'd.status',
        't.title',
        't.year',
        'r.indexer_source',
        'm.media_type',
        'd.season_number',
        'd.episode_number',
      ])
      .orderBy('d.started_at', 'desc')
      .limit(limit)
      .execute()
  },

  async listInProgress() {
    return await db
      .selectFrom('downloads as d')
      .innerJoin('media as m', 'm.id', 'd.media_id')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .where('d.status', 'in', IN_PROGRESS_STATUSES)
      .select([
        'd.id',
        'd.media_id',
        'd.source_id',
        'd.progress',
        'd.speed',
        'd.eta',
        'd.status',
        'd.error_at',
        't.title',
        't.year',
        't.poster_path',
      ])
      .select((eb) =>
        eb
          .case()
          .when('d.status', 'in', IN_PROGRESS_STATUSES)
          .then(true)
          .else(false)
          .end()
          .as('active')
      )
      .select((eb) =>
        eb
          .selectFrom('events as ev')
          .whereRef('ev.media_id', '=', 'd.media_id')
          .where('ev.event_type', '=', 'error')
          .where('ev.read', '=', false)
          .select(eb.fn.countAll<number>().as('cnt'))
          .as('unread_error_count')
      )
      .orderBy('d.started_at', 'desc')
      .execute()
  },

  async listWithMediaByIds(ids: number[]) {
    if (ids.length === 0) {
      return []
    }

    return await db
      .selectFrom('downloads as d')
      .innerJoin('media as m', 'm.id', 'd.media_id')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .where('d.id', 'in', ids)
      .select([
        'd.id',
        'd.media_id',
        'd.source_id',
        'd.progress',
        'd.speed',
        'd.eta',
        'd.status',
        'd.error_at',
        't.title',
        't.year',
        't.poster_path',
      ])
      .select((eb) =>
        eb
          .case()
          .when('d.status', 'in', IN_PROGRESS_STATUSES)
          .then(true)
          .else(false)
          .end()
          .as('active')
      )
      .select((eb) =>
        eb
          .selectFrom('events as ev')
          .whereRef('ev.media_id', '=', 'd.media_id')
          .where('ev.event_type', '=', 'error')
          .where('ev.read', '=', false)
          .select(eb.fn.countAll<number>().as('cnt'))
          .as('unread_error_count')
      )
      .execute()
  },

  async createBatch(data: Insertable<DB['downloads']>[]) {
    return await db
      .insertInto('downloads')
      .values(data)
      .returning([
        'id',
        'media_id',
        'source_id',
        'download_url',
        'progress',
        'speed',
        'eta',
        'source',
        'status',
        'error_at',
        'season_number',
        'episode_number',
        'started_at',
      ])
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
      .selectFrom('downloads as d')
      .where('d.media_id', '=', mediaId)
      .where('d.status', '=', 'completed')
      .where('d.content_path', 'is not', null)
      .select(['d.id', 'd.content_path'])
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

export type DownloadWithMedia = Awaited<
  ReturnType<typeof DbDownloads.listWithMediaByIds>
>[number]
