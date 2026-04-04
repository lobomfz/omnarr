import { beforeEach, describe, expect, test } from 'bun:test'

import '@/jobs/workers/scan'
import { database } from '@/db/connection'
import { DbEvents } from '@/db/events'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { Scheduler } from '@/jobs/scheduler'
import { deriveId } from '@/lib/utils'

beforeEach(() => {
  database.reset()
})

async function seedMedia() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 99999,
    media_type: 'movie',
    title: 'Scan Job Test Movie',
    imdb_id: 'tt9999999',
    year: 2020,
  })

  return await DbMedia.create({
    id: deriveId('99999:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/movies',
  })
}

describe('Scheduler.scan', () => {
  test('enqueues to correct queue and job completes', async () => {
    const media = await seedMedia()

    const job = Scheduler.scan(media.id)

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(media.id)

    expect(events).toHaveLength(1)
  })
})

describe('scan worker', () => {
  test('calls Scanner and creates completion event', async () => {
    const media = await seedMedia()

    const job = Scheduler.scan(media.id)

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(media.id)

    expect(events[0].entity_type).toBe('scan')
    expect(events[0].entity_id).toBe(media.id)
    expect(events[0].event_type).toBe('completed')
    expect(events[0].message).toBe('Scan completed: 0 files')
  })
})
