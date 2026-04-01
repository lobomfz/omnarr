import type { Insertable } from '@lobomfz/db'
import { sql } from 'kysely'
import { jsonArrayFrom } from 'kysely/helpers/sqlite'

import { db, media_type, type DB } from '@/db/connection'

export type MediaInfo = NonNullable<Awaited<ReturnType<typeof DbMedia.getInfo>>>

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
      ])
      .executeTakeFirst()
  },

  async list(filterType?: media_type) {
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
        sql<number>`count(distinct mf.id)`.as('file_count'),
        sql<number>`count(mt.id)`.as('track_count'),
        (eb) =>
          eb
            .selectFrom('downloads as d')
            .whereRef('d.media_id', '=', 'm.id')
            .where('d.status', '!=', 'error')
            .orderBy('d.started_at', 'desc')
            .select('d.status')
            .limit(1)
            .as('download_status'),
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

    if (filterType) {
      query = query.where('m.media_type', '=', filterType)
    }

    return await query.execute()
  },

  async getInfo(id: string, filters?: { season?: number; episode?: number }) {
    return await db
      .selectFrom('media as m')
      .innerJoin('tmdb_media as t', 't.id', 'm.tmdb_media_id')
      .where('m.id', '=', id)
      .select([
        'm.id',
        'm.media_type',
        'm.tmdb_media_id',
        'm.added_at',
        't.title',
        't.year',
        (eb) =>
          jsonArrayFrom(
            eb
              .selectFrom('downloads as d')
              .whereRef('d.media_id', '=', 'm.id')
              .select([
                'd.id',
                'd.status',
                'd.progress',
                'd.speed',
                'd.eta',
                'd.content_path',
                'd.error_at',
                'd.started_at',
                (eb) =>
                  jsonArrayFrom(
                    eb
                      .selectFrom('media_files as mf')
                      .whereRef('mf.download_id', '=', 'd.id')
                      .select([
                        'mf.id',
                        'mf.path',
                        'mf.size',
                        'mf.format_name',
                        'mf.duration',
                        (eb) =>
                          eb
                            .exists(
                              eb
                                .selectFrom('media_keyframes as mk')
                                .whereRef('mk.media_file_id', '=', 'mf.id')
                                .selectAll()
                            )
                            .as('has_keyframes'),
                        (eb) =>
                          eb
                            .exists(
                              eb
                                .selectFrom('media_vad as mv')
                                .whereRef('mv.media_file_id', '=', 'mf.id')
                                .selectAll()
                            )
                            .as('has_vad'),
                        (eb) =>
                          jsonArrayFrom(
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
                          ).as('tracks'),
                      ])
                      .orderBy('mf.path')
                  ).as('files'),
              ])
              .orderBy('d.started_at', 'desc')
          ).as('downloads'),
        (eb) =>
          jsonArrayFrom(
            (() => {
              let seasonsQuery = eb
                .selectFrom('seasons as s')
                .whereRef('s.tmdb_media_id', '=', 'm.tmdb_media_id')

              if (filters?.season !== undefined) {
                seasonsQuery = seasonsQuery.where(
                  's.season_number',
                  '=',
                  filters.season
                )
              }

              return seasonsQuery
                .select([
                  's.season_number',
                  's.title',
                  (eb) =>
                    jsonArrayFrom(
                      (() => {
                        let episodesQuery = eb
                          .selectFrom('episodes as e')
                          .whereRef('e.season_id', '=', 's.id')

                        if (filters?.episode !== undefined) {
                          episodesQuery = episodesQuery.where(
                            'e.episode_number',
                            '=',
                            filters.episode
                          )
                        }

                        return episodesQuery
                          .select([
                            'e.episode_number',
                            'e.title',
                            (eb) =>
                              jsonArrayFrom(
                                eb
                                  .selectFrom('media_files as mf')
                                  .whereRef('mf.episode_id', '=', 'e.id')
                                  .select([
                                    'mf.path',
                                    'mf.size',
                                    'mf.format_name',
                                    'mf.duration',
                                    (eb) =>
                                      eb
                                        .exists(
                                          eb
                                            .selectFrom('media_keyframes as mk')
                                            .whereRef(
                                              'mk.media_file_id',
                                              '=',
                                              'mf.id'
                                            )
                                            .selectAll()
                                        )
                                        .as('has_keyframes'),
                                    (eb) =>
                                      eb
                                        .exists(
                                          eb
                                            .selectFrom('media_vad as mv')
                                            .whereRef(
                                              'mv.media_file_id',
                                              '=',
                                              'mf.id'
                                            )
                                            .selectAll()
                                        )
                                        .as('has_vad'),
                                    (eb) =>
                                      jsonArrayFrom(
                                        eb
                                          .selectFrom('media_tracks as mt')
                                          .whereRef(
                                            'mt.media_file_id',
                                            '=',
                                            'mf.id'
                                          )
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
                                      ).as('tracks'),
                                  ])
                                  .orderBy('mf.path')
                              ).as('files'),
                          ])
                          .orderBy('e.episode_number')
                      })()
                    ).as('episodes'),
                ])
                .orderBy('s.season_number')
            })()
          ).as('seasons'),
      ])
      .executeTakeFirst()
  },

  async delete(id: string) {
    return await db
      .deleteFrom('media')
      .where('id', '=', id)
      .returning(['id'])
      .executeTakeFirst()
  },
}
