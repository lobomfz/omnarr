import dayjs from 'dayjs'

import type { indexer_source, media_type } from '@/db/connection'
import { db } from '@/db/connection'
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import { DbReleases } from '@/db/releases'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { indexerMap } from '@/integrations/indexers/registry'
import type { IndexerRelease } from '@/integrations/indexers/types'
import { TmdbClient } from '@/integrations/tmdb/client'
import { config } from '@/lib/config'
import { Formatters } from '@/lib/formatters'
import { Log } from '@/lib/log'
import { Parsers } from '@/lib/parsers'

const SEASONS_TTL_DAYS = 7

interface SourcedRelease extends IndexerRelease {
  indexer_source: indexer_source
}

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

    const [showData, externalIds] = await Promise.all([
      this.tmdb.getShowWithSeasons(tmdb_id),
      this.tmdb.getExternalIds(tmdb_id, 'tv'),
    ])

    if (!externalIds.imdb_id) {
      throw new Error(`TMDB entry ${tmdb_id} has no IMDB ID`)
    }

    const allEpisodes = await Promise.all(
      showData.seasons.map((s) =>
        this.tmdb.getSeasonEpisodes(tmdb_id, s.season_number)
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
  }

  private async fetch(
    tmdb_id: number,
    type: media_type,
    opts?: { season?: number }
  ) {
    const details = await this.tmdb.getDetails(tmdb_id, type)

    const indexers = config.indexers.filter(
      (c) =>
        indexerMap[c.type].types.includes(type) &&
        indexerMap[c.type].source !== 'subtitle'
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

        Log.info(`searching indexer=${c.type} imdb_id=${details.imdb_id}`)

        return await indexer
          .search({
            tmdb_id: String(tmdb_id),
            imdb_id: details.imdb_id,
            season_number: opts?.season,
          })
          .then((r) => {
            Log.info(`indexer=${c.type} returned ${r.length} results`)
            return r.map((release) => ({
              ...release,
              indexer_source: c.type,
            }))
          })
          .catch((err: Error) => {
            Log.warn(`indexer=${c.type} failed error="${err.message}"`)
            return [] as SourcedRelease[]
          })
      })
    )

    return {
      releases: results.flat(),
      label: Formatters.mediaTitle(details),
    }
  }

  async search(
    tmdb_id: number,
    type: media_type,
    filters?: { season?: number }
  ) {
    if (type === 'tv') {
      await this.fetchSeasons(tmdb_id)
    }

    const { releases, label } = await this.fetch(tmdb_id, type, filters)

    const withSE = releases.map((r) => {
      const parsed = Parsers.seasonEpisode(r.name ?? '')

      return {
        ...r,
        source_id: r.source_id.toUpperCase(),
        name: r.name ?? Formatters.releaseName(label, r.indexer_source),
        season_number: parsed.season_number ?? filters?.season ?? null,
        episode_number: parsed.episode_number,
      }
    })

    const persisted = await DbReleases.upsert(tmdb_id, type, withSE)

    Log.info(`releases persisted count=${persisted.length}`)

    if (filters?.season !== undefined) {
      return persisted.filter((r) => r.season_number === filters.season)
    }

    return persisted
  }

  async searchSubtitles(
    media_id: string,
    opts?: { season?: number; episode?: number; lang?: string }
  ) {
    const media = await DbMedia.getById(media_id)

    if (!media) {
      throw new Error(`Media '${media_id}' not found.`)
    }

    if (media.media_type === 'tv' && opts?.season === undefined) {
      throw new Error(
        'TV shows require --season. Use info to see available episodes.'
      )
    }

    if (!media.imdb_id) {
      throw new Error(`No IMDB ID found for media '${media_id}'.`)
    }

    const indexers = config.indexers.filter(
      (c) => indexerMap[c.type].source === 'subtitle'
    )

    if (indexers.length === 0) {
      throw new Error('No subtitle indexer configured.')
    }

    Log.info(
      `fetching subtitles media_id=${media_id} indexers=${indexers.length}`
    )

    const results = (
      await Promise.all(
        indexers.map(async (c) => {
          const indexer = new indexerMap[c.type](c)

          return await indexer
            .search({
              imdb_id: media.imdb_id!,
              languages: opts?.lang ? [opts.lang] : undefined,
              season_number: opts?.season,
              episode_number: opts?.episode,
            })
            .then((r) =>
              r.map((release) => ({ ...release, indexer_source: c.type }))
            )
            .catch((err) => {
              Log.warn(`indexer=${c.type} failed error="${err.message}"`)
              return []
            })
        })
      )
    ).flat()

    if (results.length === 0) {
      return []
    }

    const sourced = results.map((r) => ({
      ...r,
      source_id: r.source_id.toUpperCase(),
      name: r.name ?? Formatters.releaseName(media.title, r.indexer_source),
      season_number: opts?.season,
      episode_number: opts?.episode,
    }))

    const persisted = await DbReleases.upsert(
      media.tmdb_id,
      media.media_type,
      sourced
    )

    Log.info(`subtitles persisted count=${persisted.length}`)

    return persisted
  }
}
