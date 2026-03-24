import type { IndexerClass, IndexerConfig } from './types'
import { BeyondHdAdapter } from './beyond-hd'
import { YtsAdapter } from './yts'

export const indexerMap: Record<IndexerConfig["type"], IndexerClass> = {
  'beyond-hd': BeyondHdAdapter,
  yts: YtsAdapter,
}
