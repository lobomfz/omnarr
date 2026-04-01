import type { indexer_source } from '@/db/connection'

import { BeyondHdAdapter } from './beyond-hd'
import { SubdlAdapter } from './subdl'
import { SuperflixAdapter } from './superflix'
import type { IndexerClass } from './types'
import { YtsAdapter } from './yts'

export const indexerSchema = BeyondHdAdapter.schema
  .or(YtsAdapter.schema)
  .or(SuperflixAdapter.schema)
  .or(SubdlAdapter.schema)

export const indexerMap: Record<indexer_source, IndexerClass> = {
  'beyond-hd': BeyondHdAdapter,
  yts: YtsAdapter,
  superflix: SuperflixAdapter,
  subdl: SubdlAdapter,
}
