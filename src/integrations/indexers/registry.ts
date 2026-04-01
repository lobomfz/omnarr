import { BeyondHdAdapter } from './beyond-hd'
import { SuperflixAdapter } from './superflix'
import type { IndexerClass } from './types'
import { YtsAdapter } from './yts'

export const indexerSchema = BeyondHdAdapter.schema
  .or(YtsAdapter.schema)
  .or(SuperflixAdapter.schema)

type IndexerConfig = typeof indexerSchema.infer

export type IndexerName = IndexerConfig['type']

export const indexerMap: Record<IndexerName, IndexerClass> = {
  'beyond-hd': BeyondHdAdapter,
  yts: YtsAdapter,
  superflix: SuperflixAdapter,
}
