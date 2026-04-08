import { MemoryPublisher } from '@orpc/experimental-publisher/memory'

import type { download_status } from '@/db/connection'
import { Log } from '@/lib/log'

type PubSubChannels = {
  download_progress: {
    id: number
    media_id: string
    source_id: string
    progress: number
    speed: number
    eta: number
    status: download_status
  }
  scan_progress: {
    media_id: string
    current: number
    total: number
    path: string
  }
  subtitle_progress: {
    media_id: string
    name: string
    confidence: number | null
    offset: number
    status: 'downloading' | 'testing' | 'matched' | 'no-match'
  }
}

const publisher = new MemoryPublisher<PubSubChannels>()

export const PubSub = {
  subscribe<T extends keyof PubSubChannels>(type: T, signal?: AbortSignal) {
    return publisher.subscribe(type, { signal })
  },

  async publish<T extends keyof PubSubChannels>(
    type: T,
    data: PubSubChannels[T]
  ) {
    await publisher.publish(type, data).catch(Log.error)
  },
}
