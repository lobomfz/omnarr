import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'

import '@/jobs/workers/ripper'
import '@/jobs/workers/scan'
import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbEvents } from '@/db/events'
import { Scheduler } from '@/jobs/scheduler'
import { config } from '@/lib/config'

import '../mocks/superflix'
import { TestSeed } from '../helpers/seed'

const tracksDir = config.root_folders!.tracks!

beforeEach(async () => {
  TestSeed.reset()
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

afterAll(async () => {
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

describe('Scheduler.ripper', () => {
  test('enqueues to correct queue and job completes', async () => {
    const media = await TestSeed.library.movie({
      tmdbId: 10001,
      title: 'Ripper Worker Test',
      year: 2020,
      imdbId: 'tt0000001',
    })

    const download = await DbDownloads.create({
      media_id: media.id,
      source_id: 'ripper:sched:1',
      download_url: 'imdb:tt0000001',
      source: 'ripper',
      status: 'pending',
    })

    const job = Scheduler.ripper({
      media_id: media.id,
      download_id: download.id,
      source_id: 'ripper:sched:1',
      imdb_id: 'tt0000001',
      title: 'Test',
      tracks_dir: `${tracksDir}/${media.id}`,
    })

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(media.id)

    expect(events.length).toBeGreaterThanOrEqual(1)
  })
})

describe('ripper worker', () => {
  test('updates to completed and creates event on success', async () => {
    const media = await TestSeed.library.movie({
      tmdbId: 10001,
      title: 'Ripper Worker Test',
      year: 2020,
      imdbId: 'tt0000001',
    })

    const download = await DbDownloads.create({
      media_id: media.id,
      source_id: 'ripper:worker:1',
      download_url: 'imdb:tt0000001',
      source: 'ripper',
      status: 'pending',
    })

    const job = Scheduler.ripper({
      media_id: media.id,
      download_id: download.id,
      source_id: 'ripper:worker:1',
      imdb_id: 'tt0000001',
      title: 'Test Success',
      tracks_dir: `${tracksDir}/${media.id}`,
    })

    await job.waitUntilFinished()

    const updated = await database.kysely
      .selectFrom('downloads')
      .select(['status', 'content_path'])
      .where('id', '=', download.id)
      .executeTakeFirstOrThrow()

    expect(updated.status).toBe('completed')
    expect(updated.content_path).toBeDefined()

    const events = await DbEvents.getByMediaId(media.id)
    const completedEvent = events.find(
      (e) => e.event_type === 'completed' && e.entity_type === 'download'
    )

    expect(completedEvent).toBeDefined()
  })

  test('creates error event when all streams fail', async () => {
    const media = await TestSeed.library.movie({
      tmdbId: 10002,
      title: 'Ripper Worker Test',
      year: 2020,
      imdbId: 'tt9999999',
    })

    const download = await DbDownloads.create({
      media_id: media.id,
      source_id: 'ripper:worker:fail',
      download_url: 'imdb:tt9999999',
      source: 'ripper',
      status: 'pending',
    })

    const job = Scheduler.ripper({
      media_id: media.id,
      download_id: download.id,
      source_id: 'ripper:worker:fail',
      imdb_id: 'tt9999999',
      title: 'Test Fail',
      tracks_dir: `${tracksDir}/${media.id}`,
    })

    await job.waitUntilFinished()

    const updated = await database.kysely
      .selectFrom('downloads')
      .select(['status', 'error_at'])
      .where('id', '=', download.id)
      .executeTakeFirstOrThrow()

    expect(updated.status).toBe('error')
    expect(updated.error_at).not.toBeNull()

    const events = await DbEvents.getByMediaId(media.id)
    const errorEvent = events.find(
      (e) => e.event_type === 'error' && e.entity_type === 'download'
    )

    expect(errorEvent).toBeDefined()
    expect(errorEvent!.message).toBe('All streams failed to rip')
  })
})
