import { join } from 'path'

import { DownloadEvents } from '@/core/download-events'
import { Ripper } from '@/core/ripper'
import { DbDownloads } from '@/db/downloads'
import { DbEvents } from '@/db/events'
import { Worker } from '@/jobs/index'
import type { RipperJobData } from '@/jobs/queues'
import { Scheduler } from '@/jobs/scheduler'
import { Formatters } from '@/lib/formatters'
import { Log } from '@/lib/log'

export const ripperWorker = new Worker<RipperJobData>('ripper', async (job) => {
  Log.info(
    `ripper job started media_id=${job.data.media_id} download_id=${job.data.download_id}`
  )

  try {
    const result = await new Ripper({
      download_id: job.data.download_id,
      media_id: job.data.media_id,
      source_id: job.data.source_id,
      imdb_id: job.data.imdb_id,
      tracks_dir: job.data.tracks_dir,
      audio_only: job.data.audio_only,
      season_number: job.data.season_number,
      episode_number: job.data.episode_number,
    }).run()

    if (result.ripped > 0) {
      await DbDownloads.update(job.data.download_id, {
        status: 'completed',
        progress: 1,
        content_path:
          job.data.season_number == null || job.data.episode_number == null
            ? job.data.tracks_dir
            : join(
                job.data.tracks_dir,
                Formatters.seasonEpisodeDir(
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
    } else {
      await DbDownloads.update(job.data.download_id, {
        status: 'error',
        error_at: new Date().toISOString(),
      })

      await DbEvents.create({
        media_id: job.data.media_id,
        entity_type: 'download',
        entity_id: job.data.source_id,
        event_type: 'error',
        message: 'All streams failed to rip',
      })

      await DownloadEvents.publish(job.data.download_id)
    }

    Log.info(
      `ripper job completed media_id=${job.data.media_id} ripped=${result.ripped}/${result.total}`
    )
  } catch (err: any) {
    await DbDownloads.update(job.data.download_id, {
      status: 'error',
      error_at: new Date().toISOString(),
    })

    await DbEvents.create({
      media_id: job.data.media_id,
      entity_type: 'download',
      entity_id: job.data.source_id,
      event_type: 'error',
      message: err.message,
    })

    await DownloadEvents.publish(job.data.download_id)

    Log.error(
      `ripper job failed media_id=${job.data.media_id} error="${err.message}"`
    )
  }
})
