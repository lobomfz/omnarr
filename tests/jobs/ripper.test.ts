import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'
import { join } from 'path'

import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbEvents } from '@/db/events'
import { Scheduler } from '@/jobs/scheduler'
import { ripperWorker } from '@/jobs/workers/ripper'
import { config } from '@/lib/config'

import '../mocks/superflix'
import { TestSeed } from '../helpers/seed'

const tracksDir = config.root_folders!.tracks!

beforeAll(() => {
  ripperWorker.start()
})

beforeEach(async () => {
  TestSeed.reset()
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

afterAll(async () => {
  await ripperWorker.stop()
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

  test('stores episode-specific content_path for season audio downloads', async () => {
    const { media } = await TestSeed.library.tv({
      tmdbId: 903747,
      title: 'Breaking Bad',
      year: 2008,
      imdbId: 'tt0903747',
      rootFolder: '/tmp/omnarr-test-tv',
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodeCount: 2,
          episodes: [
            { episodeNumber: 1, title: 'Pilot' },
            { episodeNumber: 2, title: "Cat's in the Bag..." },
          ],
        },
      ],
    })

    const download1 = await DbDownloads.create({
      media_id: media.id,
      source_id: 'ripper:worker:tv:1',
      download_url: 'imdb:tt0903747',
      source: 'ripper',
      status: 'pending',
      season_number: 1,
      episode_number: 1,
    })

    const download2 = await DbDownloads.create({
      media_id: media.id,
      source_id: 'ripper:worker:tv:2',
      download_url: 'imdb:tt0903747',
      source: 'ripper',
      status: 'pending',
      season_number: 1,
      episode_number: 2,
    })

    const tracksRoot = `${tracksDir}/${media.id}`

    await Scheduler.ripper({
      media_id: media.id,
      download_id: download1.id,
      source_id: 'ripper:worker:tv:1',
      imdb_id: 'tt0903747',
      title: 'Breaking Bad',
      tracks_dir: tracksRoot,
      audio_only: true,
      season_number: 1,
      episode_number: 1,
    }).waitUntilFinished()

    await Scheduler.ripper({
      media_id: media.id,
      download_id: download2.id,
      source_id: 'ripper:worker:tv:2',
      imdb_id: 'tt0903747',
      title: 'Breaking Bad',
      tracks_dir: tracksRoot,
      audio_only: true,
      season_number: 1,
      episode_number: 2,
    }).waitUntilFinished()

    const downloads = await database.kysely
      .selectFrom('downloads')
      .select(['episode_number', 'content_path'])
      .where('media_id', '=', media.id)
      .orderBy('episode_number')
      .execute()

    expect(downloads).toHaveLength(2)
    expect(downloads[0].content_path).toBe(join(tracksRoot, 's01e01'))
    expect(downloads[1].content_path).toBe(join(tracksRoot, 's01e02'))
  })
})
