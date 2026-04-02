import { type } from 'arktype'
import axios from 'redaxios'

import { media_type } from '@/db/connection'
import { envVariables } from '@/lib/env'

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

  private parseResolution(text: string) {
    const match = text.match(/(\d{3,4}p)/i)
    return match?.[1]?.toLowerCase() ?? null
  }

  private parseCodec(text: string) {
    if (/x265|hevc|h\.?265/i.test(text)) {
      return 'x265'
    }

    if (/x264|avc|h\.?264/i.test(text)) {
      return 'x264'
    }

    if (/av1/i.test(text)) {
      return 'AV1'
    }

    return null
  }

  async search(params: SearchParams) {
    const { data } = await axios<BeyondHdResponse>({
      method: 'POST',
      baseURL: envVariables.BEYOND_HD_API_URL,
      url: this.config.api_key,
      data: {
        action: 'search',
        rsskey: this.config.rss_key,
        imdb_id: params.imdb_id,
        search: params.query,
      },
    })

    return data.results.map((r): IndexerRelease => {
      const hdr: string[] = []

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
          this.parseResolution(r.category) ?? this.parseResolution(r.name),
        codec: this.parseCodec(r.name),
        hdr,
        download_url: r.download_url,
      }
    })
  }
}
