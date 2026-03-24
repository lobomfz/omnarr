import type { PromptApi } from '@bunli/core'

import type { Config } from '@/config'

export type IndexerConfig = Config['indexers'][number]

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
  name: string
  search(params: SearchParams): Promise<IndexerRelease[]>
}

export interface IndexerClass {
  new (config: IndexerConfig): Indexer
  promptConfig(prompt: PromptApi): Promise<IndexerConfig>
}
