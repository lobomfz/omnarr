import dayjs from 'dayjs'
import axios from 'redaxios'

import type { media_type } from '@/db/connection'
import { envVariables } from '@/lib/env'
import { Log } from '@/lib/log'
import { OmnarrError } from '@/shared/errors'

import type { TmdbTypes } from './types'

export class TmdbClient {
  private async request<T>(url: string, params?: Record<string, unknown>) {
    Log.info(`tmdb request url=${url} params=${JSON.stringify(params)}`)

    const { data } = await axios<T>({
      method: 'GET',
      baseURL: envVariables.TMDB_API_URL,
      url,
      params: { api_key: envVariables.TMDB_API_KEY, ...params },
    }).catch((e) => {
      const message = e.data?.status_message ?? e.statusText

      Log.error(
        `tmdb request failed url=${url} status=${e.status} message="${message}"`
      )

      throw new OmnarrError('TMDB_UNAVAILABLE', { cause: e })
    })

    return data
  }

  private getRuntime(raw: TmdbTypes['raw_media']) {
    if (raw.runtime !== undefined) {
      return raw.runtime
    }

    if (!raw.episode_run_time || raw.episode_run_time.length === 0) {
      return null
    }

    return Math.round(
      raw.episode_run_time.reduce((a, b) => a + b, 0) /
        raw.episode_run_time.length
    )
  }

  private parse(raw: TmdbTypes['raw_media'], defaultType: media_type) {
    const date = raw.release_date ?? raw.first_air_date

    return {
      tmdb_id: raw.id,
      media_type: raw.media_type ?? defaultType,
      title: raw.title ?? raw.name ?? '',
      year: date ? dayjs(date).year() : null,
      overview: raw.overview,
      poster_path: raw.poster_path,
      backdrop_path: raw.backdrop_path,
      runtime: this.getRuntime(raw),
      vote_average: raw.vote_average,
      genres: raw.genres?.map((g) => g.name) ?? [],
    }
  }

  async search(query: string) {
    const data = await this.request<TmdbTypes['search_response']>(
      '/search/multi',
      { query }
    )

    return data.results
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
      .map((r) => this.parse(r, r.media_type!))
  }

  async getDetails(tmdbId: number, mediaType: 'movie' | 'tv') {
    const [data, externalIds] = await Promise.all([
      this.request<TmdbTypes['raw_media']>(`/${mediaType}/${tmdbId}`),
      this.request<TmdbTypes['external_ids']>(
        `/${mediaType}/${tmdbId}/external_ids`
      ),
    ])

    if (!externalIds.imdb_id) {
      throw new OmnarrError('NO_IMDB_ID')
    }

    return { ...this.parse(data, mediaType), imdb_id: externalIds.imdb_id }
  }

  async getExternalIds(tmdbId: number, mediaType: media_type) {
    return await this.request<TmdbTypes['external_ids']>(
      `/${mediaType}/${tmdbId}/external_ids`
    )
  }

  async getShowWithSeasons(tmdbId: number) {
    const data = await this.request<TmdbTypes['raw_media']>(`/tv/${tmdbId}`)

    if (!data.seasons) {
      throw new OmnarrError('TMDB_UNAVAILABLE')
    }

    return {
      ...this.parse(data, 'tv'),
      seasons: data.seasons,
    }
  }

  async getSeasonEpisodes(tmdbId: number, seasonNumber: number) {
    const data = await this.request<TmdbTypes['season_response']>(
      `/tv/${tmdbId}/season/${seasonNumber}`
    )

    return data.episodes
  }
}
