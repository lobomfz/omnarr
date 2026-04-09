import { MemoryPublisher } from '@orpc/experimental-publisher/memory'

import type { DownloadWithMedia } from '@/db/downloads'
import { Log } from '@/lib/log'

type PubSubChannels = {
  download_progress: DownloadWithMedia
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
  export_progress: {
    media_id: string
    output: string
    ratio: number
  }
  scan_file_progress: {
    media_id: string
    path: string
    step: 'keyframes' | 'vad'
    ratio: number
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
