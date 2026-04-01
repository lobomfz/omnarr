import type { indexer_source } from '@/db/connection'

import { BeyondHdAdapter } from './beyond-hd'
import { SuperflixAdapter } from './superflix'
import type { IndexerClass } from './types'
import { YtsAdapter } from './yts'

export const indexerSchema = BeyondHdAdapter.schema
  .or(YtsAdapter.schema)
  .or(SuperflixAdapter.schema)

export const indexerMap: Record<indexer_source, IndexerClass> = {
  'beyond-hd': BeyondHdAdapter,
  yts: YtsAdapter,
  superflix: SuperflixAdapter,
}
