import type { DbFieldMeta } from '@lobomfz/db'
import type { Type } from 'arktype'

import type { download_source, media_type } from '@/db/connection'

declare global {
  interface ArkEnv {
    meta(): DbFieldMeta & { label?: string }
  }
}

export interface IndexerRelease {
  source_id: string
  name: string | null
  size: number
  seeders?: number
  imdb_id: string | null
  resolution: string | null
  codec: string | null
  hdr: string[]
  download_url: string
  language?: string
}

export interface SearchParams {
  query?: string
  tmdb_id?: string
  imdb_id?: string
  languages?: string[]
  season_number?: number
  episode_number?: number
}

export interface Indexer {
  search(params: SearchParams): Promise<IndexerRelease[]>
}

export interface IndexerClass {
  new (config: any): Indexer
  schema: Type<{ type: string }>
  name: string
  types: media_type[]
  source: download_source
}
