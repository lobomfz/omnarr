import { SubtitleMatcher } from '@/core/subtitle-matcher'
import { DbEvents } from '@/db/events'
import { Worker } from '@/jobs/index'
import type { SubtitleMatchJobData } from '@/jobs/queues'
import { Log } from '@/lib/log'

export const subtitleMatchWorker = new Worker<SubtitleMatchJobData>(
  'subtitle-match',
  async (job) => {
    const data = job.data

    Log.info(`subtitle-match job started media_id=${data.media_id}`)

    try {
      const matcher = new SubtitleMatcher({
        id: data.media_id,
        episode_id: data.episode_id,
      })

      const result = await matcher.match({
        lang: data.lang,
        season: data.season,
        episode: data.episode,
      })

      if (result.matched) {
        await DbEvents.create({
          media_id: data.media_id,
          entity_type: 'subtitle',
          entity_id: data.media_id,
          event_type: 'completed',
          message: `Subtitle matched: ${result.matched.name} (confidence: ${result.matched.confidence?.toFixed(1)})`,
        })
      } else {
        await DbEvents.create({
          media_id: data.media_id,
          entity_type: 'subtitle',
          entity_id: data.media_id,
          event_type: 'completed',
          message: `No subtitle matched (${result.tested.length} tested)`,
        })
      }

      Log.info(
        `subtitle-match job completed media_id=${data.media_id} matched=${!!result.matched}`
      )
    } catch (err: any) {
      const message = err.message

      await DbEvents.create({
        media_id: data.media_id,
        entity_type: 'subtitle',
        entity_id: data.media_id,
        event_type: 'error',
        message,
      })

      Log.error(
        `subtitle-match job failed media_id=${data.media_id} error="${message}"`
      )
    }
  }
)
