import {
  type Insertable,
  type ExpressionBuilder,
  sql,
  jsonArrayFrom,
  jsonObjectFrom,
} from '@lobomfz/db'

import { type LibrarySchemas } from '@/api/schemas'
import { type AliasedDb, db, type DB } from '@/db/connection'

export function selectHasKeyframes(eb: ExpressionBuilder<AliasedDb, 'mf'>) {
  return eb
    .exists(
      eb
        .selectFrom('media_keyframes as mk')
        .whereRef('mk.media_file_id', '=', 'mf.id')
        .selectAll()
    )
    .as('has_keyframes')
}

export function selectHasVad(eb: ExpressionBuilder<AliasedDb, 'mf'>) {
  return eb
    .exists(
      eb
        .selectFrom('media_vad as mv')
        .whereRef('mv.media_file_id', '=', 'mf.id')
        .selectAll()
    )
    .as('has_vad')
}

export function selectTracks(eb: ExpressionBuilder<AliasedDb, 'mf'>) {
  return jsonArrayFrom(
    eb
      .selectFrom('media_tracks as mt')
      .whereRef('mt.media_file_id', '=', 'mf.id')
      .select([
        'mt.stream_index',
        'mt.stream_type',
        'mt.codec_name',
        'mt.language',
        'mt.title',
        'mt.is_default',
        'mt.width',
        'mt.height',
        'mt.channel_layout',
      ])
      .orderBy('mt.stream_index')
  ).as('tracks')
}

export const DbMedia = {
  async create(data: Insertable<DB['media']>) {
    return await db
      .insertInto('media')
      .values(data)
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          id: (eb) => eb.ref('excluded.id'),
        })
      )
      .returning([
        'id',
        'tmdb_media_id',
        'media_type',
        'root_folder',
        'added_at',
      ])
      .executeTakeFirstOrThrow()
  },

  async getById(id: string) {
    return await db
      .selectFrom('media as m')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .where('m.id', '=', id)
      .select([
        'm.root_folder',
        'm.media_type',
        'm.tmdb_media_id',
        't.title',
        't.year',
        't.tmdb_id',
        't.imdb_id',
        't.poster_path',
        't.overview',
      ])
      .executeTakeFirst()
  },

  async list(filters: typeof LibrarySchemas.list.infer) {
    let query = db
      .selectFrom('media as m')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .leftJoin('media_files as mf', 'mf.media_id', 'm.id')
      .leftJoin('media_tracks as mt', 'mt.media_file_id', 'mf.id')
      .select([
        'm.id',
        'm.media_type',
        't.title',
        't.year',
        't.poster_path',
        't.backdrop_path',
        't.overview',
        sql<number>`count(distinct mf.id)`.as('file_count'),
        (eb) => eb.fn.count<number>('mt.id').as('track_count'),
        (eb) =>
          jsonObjectFrom(
            eb
              .selectFrom('downloads as d')
              .whereRef('d.media_id', '=', 'm.id')
              .where('d.status', '!=', 'error')
              .orderBy('d.started_at', 'desc')
              .select(['d.status', 'd.progress', 'd.speed'])
              .limit(1)
          ).as('download'),
        (eb) =>
          eb
            .selectFrom('events as ev')
            .whereRef('ev.media_id', '=', 'm.id')
            .where('ev.event_type', '=', 'error')
            .where('ev.read', '=', false)
            .select(eb.fn.countAll<number>().as('cnt'))
            .as('unread_error_count'),
        (eb) =>
          eb
            .selectFrom('seasons as s2')
            .whereRef('s2.tmdb_media_id', '=', 'm.tmdb_media_id')
            .select(sql<number>`coalesce(sum(s2.episode_count), 0)`.as('total'))
            .as('total_episodes'),
        (eb) =>
          eb
            .selectFrom('media_files as mf2')
            .whereRef('mf2.media_id', '=', 'm.id')
            .where('mf2.episode_id', 'is not', null)
            .select(sql<number>`count(distinct mf2.episode_id)`.as('count'))
            .as('episodes_with_files'),
      ])
      .groupBy('m.id')
      .orderBy('m.added_at', 'desc')

    if (filters.media_type) {
      query = query.where('m.media_type', '=', filters.media_type)
    }

    return await query.execute()
  },

  async spotlight() {
    const row = await db
      .selectFrom('media as m')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .where('t.backdrop_path', 'is not', null)
      .select(['m.id', 't.title', 't.overview', 't.backdrop_path'])
      .orderBy(sql`random()`)
      .limit(1)
      .executeTakeFirst()

    return { row }
  },

  async delete(id: string) {
    return await db
      .deleteFrom('media')
      .where('id', '=', id)
      .returning(['id'])
      .executeTakeFirst()
  },
}
