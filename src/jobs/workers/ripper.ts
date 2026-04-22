import { join } from 'path'

import { DownloadEvents } from '@/core/download-events'
import { Ripper } from '@/core/ripper'
import { DbDownloads } from '@/db/downloads'
import { DbEvents } from '@/db/events'
import { Worker } from '@/jobs/index'
import type { RipperJobData } from '@/jobs/queues'
import { Scheduler } from '@/jobs/scheduler'
import { Log } from '@/lib/log'
import { Paths } from '@/lib/paths'

async function fail(data: RipperJobData, message: string) {
  await DbDownloads.update(data.download_id, {
    status: 'error',
    error_at: new Date(),
  })

  await DbEvents.create({
    media_id: data.media_id,
    entity_type: 'download',
    entity_id: data.source_id,
    event_type: 'error',
    message,
  })

  await DownloadEvents.publish(data.download_id)
}

export const ripperWorker = new Worker<RipperJobData>('ripper', async (job) => {
  Log.info(
    `ripper job started media_id=${job.data.media_id} download_id=${job.data.download_id}`
  )

  const result = await new Ripper({
    download_id: job.data.download_id,
    media_id: job.data.media_id,
    source_id: job.data.source_id,
    imdb_id: job.data.imdb_id,
    tracks_dir: job.data.tracks_dir,
    audio_only: job.data.audio_only,
    season_number: job.data.season_number,
    episode_number: job.data.episode_number,
  })
    .run()
    .catch(async (err: any) => {
      await fail(job.data, err.message)

      Log.error(
        `ripper job failed media_id=${job.data.media_id} error="${err.message}"`
      )

      throw err
    })

  if (result.ripped === 0) {
    await fail(job.data, 'All streams failed to rip')

    return
  }

  await DbDownloads.update(job.data.download_id, {
    status: 'completed',
    progress: 1,
    content_path:
      job.data.season_number == null || job.data.episode_number == null
        ? job.data.tracks_dir
        : join(
            job.data.tracks_dir,
            Paths.seasonEpisodeDir(
              job.data.season_number,
              job.data.episode_number
            )
          ),
  })

  await DbEvents.create({
    media_id: job.data.media_id,
    entity_type: 'download',
    entity_id: job.data.source_id,
    event_type: 'completed',
    message: `Rip completed: ${job.data.title}`,
  })

  await DownloadEvents.publish(job.data.download_id)

  Scheduler.scan(job.data.media_id)

  Log.info(
    `ripper job completed media_id=${job.data.media_id} ripped=${result.ripped}/${result.total}`
  )
})
