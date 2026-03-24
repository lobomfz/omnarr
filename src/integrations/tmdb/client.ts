import dayjs from 'dayjs'
import axios from 'redaxios'

import { media_type } from '@/db/connection'
import { envVariables } from '@/env'

import type { TmdbTypes } from './types'

export class TmdbClient {
  private async request<T>(url: string, params?: Record<string, unknown>) {
    const { data } = await axios<T>({
      method: 'GET',
      baseURL: envVariables.TMDB_API_URL,
      url,
      params: { api_key: envVariables.TMDB_API_KEY, ...params },
    }).catch((e) => {
      throw new Error(
        `TMDB ${e.status}: ${e.data?.status_message ?? e.statusText}`
      )
    })

    return data
  }

  private parse(
    raw: TmdbTypes['raw_media'],
    defaultType: media_type
  ): TmdbTypes['media'] {
    const date = raw.release_date ?? raw.first_air_date

    return {
      tmdb_id: raw.id,
      media_type: raw.media_type ?? defaultType,
      title: raw.title ?? raw.name ?? '',
      year: date ? dayjs(date).year() : null,
      overview: raw.overview,
      poster_path: raw.poster_path,
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
    const data = await this.request<TmdbTypes['raw_media']>(
      `/${mediaType}/${tmdbId}`
    )

    return this.parse(data, mediaType)
  }

  getExternalIds(tmdbId: number, mediaType: media_type) {
    return this.request<TmdbTypes['external_ids']>(
      `/${mediaType}/${tmdbId}/external_ids`
    )
  }
}
