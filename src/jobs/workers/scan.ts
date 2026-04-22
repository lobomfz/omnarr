import { Scanner } from '@/core/scanner'
import { DbEvents } from '@/db/events'
import { Worker } from '@/jobs/index'
import { type ScanJobData } from '@/jobs/queues'
import { Log } from '@/lib/log'

export const scanWorker = new Worker<ScanJobData>('scan', async (job) => {
  const { media_id, force } = job.data

  Log.info(`scan job started media_id=${media_id}`)

  const files = await new Scanner()
    .scan(media_id, { force })
    .catch(async (err: any) => {
      await DbEvents.create({
        media_id,
        entity_type: 'scan',
        entity_id: media_id,
        event_type: 'error',
        message: err.message,
      })

      Log.error(`scan job failed media_id=${media_id} error="${err.message}"`)

      throw err
    })

  await DbEvents.create({
    media_id,
    entity_type: 'scan',
    entity_id: media_id,
    event_type: 'completed',
    message: `Scan completed: ${files.length} files`,
  })

  Log.info(`scan job completed media_id=${media_id} files=${files.length}`)
})
