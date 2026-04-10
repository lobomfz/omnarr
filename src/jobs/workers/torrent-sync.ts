import { TorrentSync } from '@/core/torrent-sync'
import { Queue, Worker } from '@/jobs/index'
import { Log } from '@/lib/log'

const sync = new TorrentSync()
const torrentSyncQueue = new Queue('torrent-sync')

torrentSyncQueue.schedule('torrent-sync', {
  every: 5000,
  immediately: true,
})

export const torrentSyncWorker = new Worker(
  'torrent-sync',
  async () => {
    const result = await sync.sync()

    if (result.updated > 0) {
      Log.info(
        `torrent-sync job updated=${result.updated} completed=${result.completed.length}`
      )
    }
  }
)
