import type { DbFieldMeta } from '@lobomfz/db'
import type { Type } from 'arktype'

declare global {
  interface ArkEnv {
    meta(): DbFieldMeta & { label?: string }
  }
}

export interface IndexerRelease {
  torrent_id: string
  info_hash: string
  name: string
  size: number
  seeders: number
  imdb_id: string | null
  resolution: string | null
  codec: string | null
  hdr: string[]
  download_url: string
}

export interface SearchParams {
  query?: string
  tmdb_id?: string
  imdb_id?: string
}

export interface Indexer {
  search(params: SearchParams): Promise<IndexerRelease[]>
}

export interface IndexerClass {
  new (config: any): Indexer
  schema: Type<{ type: string }>
  name: string
}
