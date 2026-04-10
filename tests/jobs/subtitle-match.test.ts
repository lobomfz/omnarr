import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'

import { DbEvents } from '@/db/events'
import { Scheduler } from '@/jobs/scheduler'
import { subtitleMatchWorker } from '@/jobs/workers/subtitle-match'
import { config } from '@/lib/config'

import { TestSeed } from '../helpers/seed'
import { SubdlMock } from '../mocks/subdl'

const tracksDir = config.root_folders!.tracks!

beforeAll(() => {
  subtitleMatchWorker.start()
})

beforeEach(async () => {
  TestSeed.reset()
  SubdlMock.reset()
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

afterAll(async () => {
  await subtitleMatchWorker.stop()
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

async function setupMovieWithVad() {
  return await TestSeed.subtitleMatch.movieWithVad()
}

describe('Scheduler.subtitleMatch', () => {
  test('enqueues to correct queue and job completes', async () => {
    const mediaId = await setupMovieWithVad()

    const job = Scheduler.subtitleMatch({
      media_id: mediaId,
    })

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(mediaId)

    expect(events.length).toBeGreaterThanOrEqual(1)
  })
})

describe('subtitle-match worker', () => {
  test('creates completed event on successful match', async () => {
    const mediaId = await setupMovieWithVad()

    await SubdlMock.db
      .insertInto('subtitles')
      .values({
        id: 100,
        release_name: 'The.Matrix.1999.1080p.BluRay-GROUP',
        name: 'SUBDL::good-sync',
        lang: 'english',
        language: 'EN',
        author: 'testuser',
        url: '/subtitle/good-sync.zip',
        imdb_id: 'tt0133093',
      })
      .execute()

    const job = Scheduler.subtitleMatch({
      media_id: mediaId,
    })

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(mediaId)
    const matchEvent = events.find(
      (e) => e.entity_type === 'subtitle' && e.event_type === 'completed'
    )

    expect(matchEvent).toBeDefined()
    expect(matchEvent!.message).toContain('matched')
  })

  test('creates completed event when no match found', async () => {
    const mediaId = await setupMovieWithVad()

    await SubdlMock.db
      .insertInto('subtitles')
      .values({
        id: 100,
        release_name: 'The.Matrix.1999.Sub.Bad',
        name: 'SUBDL::bad-sync',
        lang: 'english',
        language: 'EN',
        author: 'testuser',
        url: '/subtitle/bad-sync.zip',
        imdb_id: 'tt0133093',
      })
      .execute()

    const job = Scheduler.subtitleMatch({
      media_id: mediaId,
    })

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(mediaId)
    const noMatchEvent = events.find(
      (e) =>
        e.entity_type === 'subtitle' &&
        e.event_type === 'completed' &&
        e.message.includes('No subtitle')
    )

    expect(noMatchEvent).toBeDefined()
  })

  test('creates error event on exception', async () => {
    const media = await TestSeed.library.movie({
      tmdbId: 99999,
      title: 'No VAD Movie',
      year: 2020,
      imdbId: 'tt9999999',
    })

    const job = Scheduler.subtitleMatch({
      media_id: media.id,
    })

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(media.id)
    const errorEvent = events.find(
      (e) => e.entity_type === 'subtitle' && e.event_type === 'error'
    )

    expect(errorEvent).toBeDefined()
  })
})
