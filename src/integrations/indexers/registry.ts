import { BeyondHdAdapter } from './beyond-hd'
import type { IndexerClass } from './types'
import { YtsAdapter } from './yts'

export const indexerMap: Record<IndexerConfig['type'], IndexerClass> = {
  'beyond-hd': BeyondHdAdapter,
  yts: YtsAdapter,
}

export const indexerSchema = BeyondHdAdapter.schema.or(YtsAdapter.schema)

export type IndexerConfig = typeof indexerSchema.infer
