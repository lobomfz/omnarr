import { beforeEach, describe, expect, test } from 'bun:test'

import '@/jobs/workers/scan'
import { DbEvents } from '@/db/events'
import { Scheduler } from '@/jobs/scheduler'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

async function seedMedia() {
  return await TestSeed.library.movie({
    tmdbId: 99999,
    title: 'Scan Job Test Movie',
    year: 2020,
    imdbId: 'tt9999999',
    rootFolder: '/movies',
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
