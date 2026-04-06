import {
  type RipperJobData,
  type SubtitleMatchJobData,
  ripperQueue,
  scanQueue,
  subtitleMatchQueue,
} from '@/jobs/queues'
import { Log } from '@/lib/log'

export const Scheduler = {
  scan(mediaId: string, force?: boolean) {
    const job = scanQueue.add('scan', {
      media_id: mediaId,
      force,
    })

    Log.info(`scan enqueued media_id=${mediaId}`)

    return job
  },

  ripper(data: RipperJobData) {
    const job = ripperQueue.add('ripper', data)

    Log.info(`ripper enqueued media_id=${data.media_id}`)

    return job
  },

  subtitleMatch(data: SubtitleMatchJobData) {
    const job = subtitleMatchQueue.add('subtitle-match', data)

    Log.info(`subtitle-match enqueued media_id=${data.media_id}`)

    return job
  },
}
