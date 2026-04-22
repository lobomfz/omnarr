import { Tmdb } from '@/core/tmdb'
import type { indexer_source, media_type } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { DbReleases } from '@/db/releases'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { indexerMap } from '@/integrations/indexers/registry'
import type { IndexerRelease } from '@/integrations/indexers/types'
import { TmdbClient } from '@/integrations/tmdb/client'
import { config } from '@/lib/config'
import { Formatters } from '@/lib/formatters'
import { Log } from '@/lib/log'
import { Parsers } from '@/lib/parsers'
import { OmnarrError } from '@/shared/errors'

interface SourcedRelease extends IndexerRelease {
  indexer_source: indexer_source
}

export class Releases {
  private tmdb = new TmdbClient()

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
      throw new OmnarrError('NO_INDEXERS')
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

            return {
              releases: r.map((release) => ({
                ...release,
                indexer_source: c.type,
              })),
              status: { name: c.type, count: r.length, error: false },
            }
          })
          .catch((err: Error) => {
            Log.warn(`indexer=${c.type} failed error="${err.message}"`)

            return {
              releases: [] as SourcedRelease[],
              status: { name: c.type, count: 0, error: true },
            }
          })
      })
    )

    return {
      releases: results.flatMap((r) => r.releases),
      indexer_status: results.map((r) => r.status),
      label: Formatters.mediaTitle(details),
    }
  }

  private async processAndPersist(
    tmdb_id: number,
    type: media_type,
    releases: SourcedRelease[],
    label: string,
    filters?: { season?: number }
  ) {
    const withSE = releases.map((r) => {
      const parsed = Parsers.seasonEpisode(r.name ?? '')

      return {
        ...r,
        source_id: r.source_id.toUpperCase(),
        name: r.name ?? Formatters.releaseName(label, r.indexer_source),
        season_number: parsed.season_number ?? filters?.season,
        episode_number: parsed.episode_number,
      }
    })

    const persisted = await DbReleases.upsert(tmdb_id, type, withSE)

    Log.info(`releases persisted count=${persisted.length}`)

    return persisted.sort((a, b) => b.seeders - a.seeders)
  }

  async search(
    tmdb_id: number,
    type: media_type,
    filters?: { season?: number }
  ) {
    if (type === 'tv') {
      await Tmdb.fetchSeasons(tmdb_id)
    }

    const { releases, indexer_status, label } = await this.fetch(
      tmdb_id,
      type,
      filters
    )

    return {
      releases: await this.processAndPersist(
        tmdb_id,
        type,
        releases,
        label,
        filters
      ),
      indexer_status,
    }
  }

  async searchSingle(
    tmdb_id: number,
    type: media_type,
    source: indexer_source,
    filters?: { season?: number }
  ) {
    const tmdbMedia = await DbTmdbMedia.getByTmdbId(tmdb_id, type)

    if (!tmdbMedia?.imdb_id) {
      throw new OmnarrError('NO_IMDB_ID')
    }

    const indexerConfig = config.indexers.find((c) => c.type === source)

    if (!indexerConfig) {
      throw new OmnarrError('NO_INDEXERS')
    }

    Log.info(`fetching releases tmdb_id=${tmdb_id} indexer=${source}`)

    const indexer = new indexerMap[source](indexerConfig)

    const results = await indexer
      .search({
        tmdb_id: String(tmdb_id),
        imdb_id: tmdbMedia.imdb_id,
        season_number: filters?.season,
      })
      .catch((err: Error) => {
        Log.warn(`indexer=${source} failed error="${err.message}"`)
        return []
      })

    Log.info(`indexer=${source} returned ${results.length} results`)

    const sourced = results.map((r) => ({ ...r, indexer_source: source }))

    return await this.processAndPersist(
      tmdb_id,
      type,
      sourced,
      tmdbMedia.title,
      filters
    )
  }

  async searchSubtitles(
    media_id: string,
    opts?: { season?: number; episode?: number; lang?: string }
  ) {
    const media = await DbMedia.getById(media_id)

    if (!media) {
      throw new OmnarrError('MEDIA_NOT_FOUND')
    }

    if (media.media_type === 'tv' && opts?.season === undefined) {
      throw new OmnarrError('TV_REQUIRES_SEASON')
    }

    if (!media.imdb_id) {
      throw new OmnarrError('NO_IMDB_ID')
    }

    const indexers = config.indexers.filter(
      (c) => indexerMap[c.type].source === 'subtitle'
    )

    if (indexers.length === 0) {
      throw new OmnarrError('NO_SUBTITLE_INDEXER')
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
              imdb_id: media.imdb_id,
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
