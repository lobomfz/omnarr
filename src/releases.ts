import dayjs from 'dayjs'

import { config } from '@/config'
import { media_type } from '@/db/connection'
import { DbEpisodes } from '@/db/episodes'
import { DbReleases } from '@/db/releases'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { indexerMap } from '@/integrations/indexers/registry'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Log } from '@/log'
import { Parsers } from '@/parsers'

const SEASONS_TTL_DAYS = 7

export class Releases {
  private tmdb = new TmdbClient()

  private async fetchSeasons(tmdb_id: number) {
    const existing = await DbTmdbMedia.getByTmdbId(tmdb_id, 'tv')

    if (existing?.seasons_updated_at) {
      const age = dayjs().diff(dayjs(existing.seasons_updated_at), 'day')

      if (age < SEASONS_TTL_DAYS) {
        return
      }
    }

    const showData = await this.tmdb.getShowWithSeasons(tmdb_id)

    const tmdbMedia = await DbTmdbMedia.upsert({
      tmdb_id: showData.tmdb_id,
      media_type: 'tv',
      title: showData.title,
      year: showData.year,
      overview: showData.overview,
      poster_path: showData.poster_path,
    })

    const seasonRows = await DbSeasons.upsert(
      showData.seasons.map((s) => ({
        tmdb_media_id: tmdbMedia.id,
        season_number: s.season_number,
        title: s.name,
        episode_count: s.episode_count,
      }))
    )

    const episodesBySeason = await Promise.all(
      seasonRows.map(async (row) => {
        const episodes = await this.tmdb.getSeasonEpisodes(
          tmdb_id,
          row.season_number
        )

        return episodes.map((e) => ({
          season_id: row.id,
          episode_number: e.episode_number,
          title: e.name,
        }))
      })
    )

    await DbEpisodes.upsert(episodesBySeason.flat())

    Log.info(
      `seasons fetched tmdb_id=${tmdb_id} seasons=${showData.seasons.length}`
    )
  }

  private async fetch(tmdb_id: number, type: media_type) {
    const externalIds = await this.tmdb.getExternalIds(tmdb_id, type)

    if (!externalIds.imdb_id) {
      throw new Error('No IMDB ID found for this media.')
    }

    const indexers = config.indexers.filter((c) =>
      indexerMap[c.type].types.includes(type)
    )

    if (indexers.length === 0) {
      throw new Error('No indexers configured.')
    }

    Log.info(
      `fetching releases tmdb_id=${tmdb_id} type=${type} indexers=${indexers.length}`
    )

    const results = await Promise.all(
      indexers.map(async (c) => {
        const indexer = new indexerMap[c.type](c)

        Log.info(`searching indexer=${c.type} imdb_id=${externalIds.imdb_id}`)

        return await indexer
          .search({
            tmdb_id: String(tmdb_id),
            imdb_id: externalIds.imdb_id!,
          })
          .then((r) => {
            Log.info(`indexer=${c.type} returned ${r.length} results`)
            return r.map((release) => ({ ...release, indexer_source: c.type }))
          })
          .catch((err) => {
            Log.warn(`indexer=${c.type} failed error="${err.message}"`)
            return []
          })
      })
    )

    return results.flat()
  }

  async search(
    tmdb_id: number,
    type: media_type,
    filters?: { season?: number }
  ) {
    if (type === 'tv') {
      await this.fetchSeasons(tmdb_id)
    }

    const releases = await this.fetch(tmdb_id, type)

    const withSE = releases.map((r) => ({
      ...r,
      ...Parsers.seasonEpisode(r.name),
    }))

    const persisted = await DbReleases.upsert(tmdb_id, type, withSE)

    Log.info(`releases persisted count=${persisted.length}`)

    if (filters?.season !== undefined) {
      return persisted.filter((r) => r.season_number === filters.season)
    }

    return persisted
  }
}
