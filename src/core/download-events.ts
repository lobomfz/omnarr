import { PubSub } from '@/api/pubsub'
import { DbDownloads } from '@/db/downloads'

export const DownloadEvents = {
  async publish(id: number) {
    await this.publishMany([id])
  },

  async publishMany(ids: number[]) {
    const rows = await DbDownloads.listWithMediaByIds(ids)

    await Promise.all(rows.map((r) => PubSub.publish('download_progress', r)))
  },
}
