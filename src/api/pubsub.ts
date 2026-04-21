import { MemoryPublisher } from '@orpc/experimental-publisher/memory'

import type { scan_progress_step } from '@/db/connection'
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
  scan_completed: {
    media_id: string
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
    current_step: scan_progress_step
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
