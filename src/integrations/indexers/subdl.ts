import { type } from '@lobomfz/db'
import axios from 'redaxios'

import { envVariables } from '@/lib/env'
import { Log } from '@/lib/log'

import type { Indexer, IndexerRelease } from './types'

const SUBDL_LANGUAGES = [
  'AR',
  'BR_PT',
  'DA',
  'NL',
  'EN',
  'FA',
  'FI',
  'FR',
  'ID',
  'IT',
  'NO',
  'RO',
  'ES',
  'SV',
  'VI',
  'SQ',
  'AZ',
  'BE',
  'BN',
  'ZH_BG',
  'BS',
  'BG',
  'BG_EN',
  'MY',
  'CA',
  'ZH',
  'HR',
  'CS',
  'NL_EN',
  'EN_DE',
  'EO',
  'ET',
  'KA',
  'DE',
  'EL',
  'KL',
  'HE',
  'HI',
  'HU',
  'HU_EN',
  'IS',
  'JA',
  'KO',
  'KU',
  'LV',
  'LT',
  'MK',
  'MS',
  'ML',
  'MNI',
  'PL',
  'PT',
  'RU',
  'SR',
  'SI',
  'SK',
  'SL',
  'TL',
  'TA',
  'TE',
  'TH',
  'TR',
  'UK',
  'UR',
] as const

export const subdlLanguage = type.enumerated(...SUBDL_LANGUAGES)

type SubdlSubtitle = {
  release_name: string
  name: string
  lang: string
  language: string
  author: string
  url: string
  season: number | null
  episode: number | null
}

type SubdlResponse = {
  status: boolean
  subtitles: SubdlSubtitle[]
  error?: string
}

export class SubdlAdapter implements Indexer {
  static schema = type({
    type: "'subdl'",
    api_key: type('string').configure({ label: 'SubDL API Key:' }),
    languages: subdlLanguage
      .array()
      .configure({ label: 'Subtitle Languages:' }),
  })

  static name = 'SubDL'

  static types: ('movie' | 'tv')[] = ['movie', 'tv']

  static source = 'subtitle' as const

  constructor(private config: typeof SubdlAdapter.schema.infer) {}

  search: Indexer['search'] = async (params) => {
    if (!params.imdb_id) {
      return []
    }

    const languages = params.languages ?? this.config.languages

    Log.info(
      `subdl: searching imdb=${params.imdb_id} languages=${languages.join(',')}`
    )

    const { data } = await axios<SubdlResponse>({
      method: 'GET',
      baseURL: envVariables.SUBDL_API_URL,
      url: '/api/v1/subtitles',
      params: {
        api_key: this.config.api_key,
        imdb_id: params.imdb_id,
        languages: languages.join(','),
        subs_per_page: 30,
        ...(params.season_number !== undefined && {
          season_number: params.season_number,
        }),
        ...(params.episode_number !== undefined && {
          episode_number: params.episode_number,
        }),
      },
    })

    if (!data.status) {
      Log.warn(
        `subdl: API error imdb=${params.imdb_id} error="${data.error ?? 'unknown'}"`
      )

      throw new Error(`SubDL: ${data.error ?? 'unknown error'}`)
    }

    if (!data.subtitles.length) {
      return []
    }

    Log.info(
      `subdl: found ${data.subtitles.length} subtitles imdb=${params.imdb_id}`
    )

    return data.subtitles.map(
      (s): IndexerRelease => ({
        source_id: `subdl:${s.url}`,
        name: s.release_name,
        size: 0,
        seeders: 0,
        imdb_id: params.imdb_id!,
        resolution: null,
        codec: null,
        hdr: [],
        download_url: `${envVariables.SUBDL_DOWNLOAD_URL}${s.url}`,
        language: s.language,
      })
    )
  }
}
