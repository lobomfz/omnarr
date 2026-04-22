import { jsonArrayFrom } from '@lobomfz/db'

import { Tmdb } from '@/core/tmdb'
import { db } from '@/db/connection'
import { selectHasKeyframes, selectHasVad, selectTracks } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbSearchResults } from '@/db/search-results'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { TmdbClient } from '@/integrations/tmdb/client'
import { OmnarrError } from '@/shared/errors'

export class MediaResolver {
  constructor(
    private id: string,
    private filters?: { season?: number; episode?: number }
  ) {}

  async resolve() {
    await this.assertMedia()

    const media = await this.getMedia()
    const active_scan =
      media.tmdb_media_id === null
        ? null
        : await DbMediaFiles.getActiveScan(media.id)

    return { ...media, active_scan }
  }

  async assertMedia() {
    const existing = await db
      .selectFrom('tmdb_media as t')
      .where('t.derived_id', '=', this.id)
      .select(['t.id', 't.tmdb_id', 't.media_type'])
      .executeTakeFirst()

    if (existing) {
      if (existing.media_type === 'tv') {
        await Tmdb.fetchSeasons(existing.tmdb_id)
      }

      return
    }

    const searchResult = await DbSearchResults.getById(this.id)

    if (!searchResult) {
      throw new OmnarrError('SEARCH_RESULT_NOT_FOUND')
    }

    const details = await new TmdbClient().getDetails(
      searchResult.tmdb_id,
      searchResult.media_type
    )

    await DbTmdbMedia.upsert({
      tmdb_id: details.tmdb_id,
      media_type: details.media_type,
      title: details.title,
      year: details.year,
      overview: details.overview,
      poster_path: details.poster_path,
      backdrop_path: details.backdrop_path,
      runtime: details.runtime,
      vote_average: details.vote_average,
      genres: details.genres,
      imdb_id: details.imdb_id,
    })

    if (searchResult.media_type === 'tv') {
      await Tmdb.fetchSeasons(searchResult.tmdb_id)
    }
  }

  async getMedia() {
    return await db
      .selectFrom('tmdb_media as t')
      .leftJoin('media as m', (join) =>
        join.onRef('m.tmdb_media_id', '=', 't.id')
      )
      .where('t.derived_id', '=', this.id)
      .select([
        't.derived_id as id',
        't.tmdb_id',
        't.media_type',
        't.title',
        't.year',
        't.poster_path',
        't.backdrop_path',
        't.overview',
        't.runtime',
        't.vote_average',
        't.genres',
        't.imdb_id',
        'm.added_at',
        'm.root_folder',
        'm.tmdb_media_id',
        (eb) =>
          jsonArrayFrom(
            eb
              .selectFrom('downloads as d')
              .innerJoin('media as m2', 'm2.id', 'd.media_id')
              .whereRef('m2.tmdb_media_id', '=', 't.id')
              .select([
                'd.id',
                'd.source_id',
                'd.source',
                'd.status',
                'd.progress',
                'd.speed',
                'd.eta',
                'd.content_path',
                'd.error_at',
                'd.season_number',
                'd.episode_number',
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
                        selectHasKeyframes,
                        selectHasVad,
                        selectTracks,
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
                .whereRef('s.tmdb_media_id', '=', 't.id')

              if (this.filters?.season !== undefined) {
                seasonsQuery = seasonsQuery.where(
                  's.season_number',
                  '=',
                  this.filters.season
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

                        if (this.filters?.episode !== undefined) {
                          episodesQuery = episodesQuery.where(
                            'e.episode_number',
                            '=',
                            this.filters.episode
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
                                    'mf.id',
                                    'mf.download_id',
                                    'mf.path',
                                    'mf.size',
                                    'mf.format_name',
                                    'mf.duration',
                                    selectHasKeyframes,
                                    selectHasVad,
                                    selectTracks,
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
      .executeTakeFirstOrThrow()
  }
}
