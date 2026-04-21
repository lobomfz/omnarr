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
  const data = job.data

  Log.info(
    `ripper job started media_id=${data.media_id} download_id=${data.download_id}`
  )

  try {
    const result = await new Ripper({
      download_id: data.download_id,
      media_id: data.media_id,
      source_id: data.source_id,
      imdb_id: data.imdb_id,
      tracks_dir: data.tracks_dir,
      audio_only: data.audio_only,
      season_number: data.season_number,
      episode_number: data.episode_number,
    }).run()

    if (result.ripped > 0) {
      await DbDownloads.update(data.download_id, {
        status: 'completed',
        progress: 1,
        content_path:
          data.season_number == null || data.episode_number == null
            ? data.tracks_dir
            : join(
                data.tracks_dir,
                Formatters.seasonEpisodeDir(
                  data.season_number,
                  data.episode_number
                )
              ),
      })

      await DbEvents.create({
        media_id: data.media_id,
        entity_type: 'download',
        entity_id: data.source_id,
        event_type: 'completed',
        message: `Rip completed: ${data.title}`,
      })

      await DownloadEvents.publish(data.download_id)

      Scheduler.scan(data.media_id)
    } else {
      await DbDownloads.update(data.download_id, {
        status: 'error',
        error_at: new Date().toISOString(),
      })

      await DbEvents.create({
        media_id: data.media_id,
        entity_type: 'download',
        entity_id: data.source_id,
        event_type: 'error',
        message: 'All streams failed to rip',
      })

      await DownloadEvents.publish(data.download_id)
    }

    Log.info(
      `ripper job completed media_id=${data.media_id} ripped=${result.ripped}/${result.total}`
    )
  } catch (err: any) {
    const message = err.message

    await DbDownloads.update(data.download_id, {
      status: 'error',
      error_at: new Date().toISOString(),
    })

    await DbEvents.create({
      media_id: data.media_id,
      entity_type: 'download',
      entity_id: data.source_id,
      event_type: 'error',
      message,
    })

    await DownloadEvents.publish(data.download_id)

    Log.error(`ripper job failed media_id=${data.media_id} error="${message}"`)
  }
})
