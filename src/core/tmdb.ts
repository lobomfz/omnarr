import dayjs from 'dayjs'

import { db } from '@/db/connection'
import { DbEpisodes } from '@/db/episodes'
import { DbSearchResults } from '@/db/search-results'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Log } from '@/lib/log'
import { OmnarrError } from '@/shared/errors'

const SEASONS_TTL_DAYS = 7

export const Tmdb = {
  async search(query: string) {
    const tmdb = new TmdbClient()
    const tmdbResults = await tmdb.search(query)

    const results = await DbSearchResults.upsert(tmdbResults)

    const tmdbMap = new Map(
      tmdbResults.map((t) => [`${t.tmdb_id}:${t.media_type}`, t])
    )

    return results.map((r) => {
      const tmdbMatch = tmdbMap.get(`${r.tmdb_id}:${r.media_type}`)

      return {
        ...r,
        poster_path: tmdbMatch?.poster_path ?? null,
        overview: tmdbMatch?.overview ?? null,
      }
    })
  },

  async getInfo(id: string) {
    const searchResult = await DbSearchResults.getById(id)

    if (!searchResult) {
      throw new OmnarrError('SEARCH_RESULT_NOT_FOUND')
    }

    const tmdb = new TmdbClient()
    const details = await tmdb.getDetails(
      searchResult.tmdb_id,
      searchResult.media_type
    )

    const tmdbMedia = await DbTmdbMedia.upsert({
      tmdb_id: details.tmdb_id,
      media_type: details.media_type,
      title: details.title,
      year: details.year,
      overview: details.overview,
      poster_path: details.poster_path,
      backdrop_path: details.backdrop_path,
      runtime: details.runtime,
      vote_average: details.vote_average,
      genres: details.genres.join(','),
      imdb_id: details.imdb_id,
    })

    if (searchResult.media_type === 'tv') {
      await this.fetchSeasons(tmdb, searchResult.tmdb_id)
    }

    const seasons =
      searchResult.media_type === 'tv'
        ? await DbSeasons.listByTmdbId(searchResult.tmdb_id)
        : []

    return {
      tmdb_id: tmdbMedia.tmdb_id,
      media_type: tmdbMedia.media_type,
      title: tmdbMedia.title,
      year: tmdbMedia.year,
      poster_path: tmdbMedia.poster_path,
      backdrop_path: tmdbMedia.backdrop_path,
      overview: tmdbMedia.overview,
      runtime: tmdbMedia.runtime,
      vote_average: tmdbMedia.vote_average,
      genres: tmdbMedia.genres?.split(',').filter(Boolean) ?? [],
      seasons,
    }
  },

  async fetchSeasons(tmdb: TmdbClient, tmdb_id: number) {
    const existing = await DbTmdbMedia.getByTmdbId(tmdb_id, 'tv')

    if (existing?.seasons_updated_at) {
      const age = dayjs().diff(dayjs(existing.seasons_updated_at), 'day')

      if (age < SEASONS_TTL_DAYS) {
        return
      }
    }

    const [showData, externalIds] = await Promise.all([
      tmdb.getShowWithSeasons(tmdb_id),
      tmdb.getExternalIds(tmdb_id, 'tv'),
    ])

    if (!externalIds.imdb_id) {
      throw new OmnarrError('NO_IMDB_ID')
    }

    const allEpisodes = await Promise.all(
      showData.seasons.map((s) =>
        tmdb.getSeasonEpisodes(tmdb_id, s.season_number)
      )
    )

    await db.transaction().execute(async (trx) => {
      const tmdbMedia = await DbTmdbMedia.upsert(
        {
          tmdb_id: showData.tmdb_id,
          media_type: 'tv',
          title: showData.title,
          year: showData.year,
          overview: showData.overview,
          poster_path: showData.poster_path,
          backdrop_path: showData.backdrop_path,
          runtime: showData.runtime,
          vote_average: showData.vote_average,
          genres: showData.genres.join(','),
          imdb_id: externalIds.imdb_id!,
        },
        trx
      )

      const seasonRows = await DbSeasons.upsert(
        showData.seasons.map((s) => ({
          tmdb_media_id: tmdbMedia.id,
          season_number: s.season_number,
          title: s.name,
          episode_count: s.episode_count,
        })),
        trx
      )

      await DbEpisodes.upsert(
        seasonRows.flatMap((row, i) =>
          allEpisodes[i].map((e) => ({
            season_id: row.id,
            episode_number: e.episode_number,
            title: e.name,
          }))
        ),
        trx
      )
    })

    Log.info(
      `seasons fetched tmdb_id=${tmdb_id} seasons=${showData.seasons.length}`
    )
  },
}
