import { type } from '@lobomfz/db'
import axios from 'redaxios'

import type { media_type, release_hdr } from '@/db/connection'
import { envVariables } from '@/lib/env'
import { Formatters } from '@/lib/formatters'
import { Parsers } from '@/lib/parsers'

import type { Indexer, IndexerRelease, SearchParams } from './types'

interface BeyondHdResult {
  id: number
  name: string
  info_hash: string
  size: number
  seeders: number
  category: string
  imdb_id: string | null
  dv: number
  hdr10: number
  'hdr10+': number
  hlg: number
  download_url: string
}

interface BeyondHdResponse {
  status_code: number
  results: BeyondHdResult[]
  success: boolean
}

export class BeyondHdAdapter implements Indexer {
  static schema = type({
    type: "'beyond-hd'",
    api_key: type('string').configure({ label: 'Beyond-HD API Key:' }),
    rss_key: type('string').configure({ label: 'Beyond-HD RSS Key:' }),
  })

  static name = 'Beyond-HD'

  static types: media_type[] = ['movie', 'tv']

  static source = 'torrent' as const

  constructor(private config: typeof BeyondHdAdapter.schema.infer) {}

  async search(params: SearchParams) {
    const searchParts = [
      params.query,
      Formatters.seasonEpisodeTag(params.season_number, params.episode_number),
    ].filter(Boolean)

    const { data } = await axios<BeyondHdResponse>({
      method: 'POST',
      baseURL: envVariables.BEYOND_HD_API_URL,
      url: this.config.api_key,
      data: {
        action: 'search',
        rsskey: this.config.rss_key,
        imdb_id: params.imdb_id,
        search: searchParts.join(' ') || undefined,
      },
    })

    return data.results.map((r): IndexerRelease => {
      const hdr: release_hdr[] = []

      if (r.dv === 1) {
        hdr.push('DV')
      }

      if (r.hdr10 === 1) {
        hdr.push('HDR10')
      }

      if (r['hdr10+'] === 1) {
        hdr.push('HDR10+')
      }

      if (r.hlg === 1) {
        hdr.push('HLG')
      }

      return {
        source_id: r.info_hash,
        name: r.name,
        size: r.size,
        seeders: r.seeders,
        imdb_id: r.imdb_id,
        resolution:
          Parsers.releaseResolution(r.category) ??
          Parsers.releaseResolution(r.name),
        codec: Parsers.releaseCodec(r.name),
        hdr,
        download_url: r.download_url,
      }
    })
  }
}
