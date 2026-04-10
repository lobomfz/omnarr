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
        poster_path: tmdbMatch?.poster_path,
        overview: tmdbMatch?.overview,
      }
    })
  },

  async fetchSeasons(tmdb_id: number) {
    const client = new TmdbClient()

    const existing = await DbTmdbMedia.getByTmdbId(tmdb_id, 'tv')

    if (existing?.seasons_updated_at) {
      const age = dayjs().diff(dayjs(existing.seasons_updated_at), 'day')

      if (age < SEASONS_TTL_DAYS) {
        return
      }
    }

    const [showData, externalIds] = await Promise.all([
      client.getShowWithSeasons(tmdb_id),
      client.getExternalIds(tmdb_id, 'tv'),
    ])

    if (!externalIds.imdb_id) {
      throw new OmnarrError('NO_IMDB_ID')
    }

    const allEpisodes = await Promise.all(
      showData.seasons.map((s) =>
        client.getSeasonEpisodes(tmdb_id, s.season_number)
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
          genres: showData.genres,
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
