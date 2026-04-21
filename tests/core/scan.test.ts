import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { PubSub } from '@/api/pubsub'
import { Scanner } from '@/core/scanner'
import { DbDownloads } from '@/db/downloads'
import { DbEvents } from '@/db/events'
import { DbMediaFiles } from '@/db/media-files'

import { MediaFixtures } from '../fixtures/media'
import { TestSeed } from '../helpers/seed'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-scan-test-'))
const refMkv = join(tmpDir, 'ref.mkv')

beforeAll(async () => {
  await MediaFixtures.generate(refMkv)
  await MediaFixtures.copy(refMkv, join(tmpDir, 'valid/movie.mkv'))
  await MediaFixtures.writeDummy(join(tmpDir, 'mixed/movie.mkv'))
  await MediaFixtures.copy(refMkv, join(tmpDir, 'mixed/bonus.mkv'))
  await MediaFixtures.copy(refMkv, join(tmpDir, 'good/movie.mkv'))
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

beforeEach(() => {
  TestSeed.reset()
})

async function seedMedia(contentPath: string) {
  const media = await TestSeed.library.matrix()

  await TestSeed.downloads.completedWithFile(media.id, { contentPath })

  return media
}

describe('Scanner file errors', () => {
  test('creates file_error event when a file fails to probe', async () => {
    const media = await seedMedia(join(tmpDir, 'mixed'))

    await new Scanner().scan(media.id)

    const events = await DbEvents.getByMediaId(media.id)
    const fileErrors = events.filter((e) => e.event_type === 'file_error')

    expect(fileErrors).toHaveLength(1)
    expect(fileErrors[0].entity_id).toContain('movie.mkv')
    expect(fileErrors[0].message).toBeTruthy()
  })

  test('continues scanning after file error', async () => {
    const media = await seedMedia(join(tmpDir, 'mixed'))

    const files = await new Scanner().scan(media.id)

    expect(files.length).toBeGreaterThanOrEqual(1)
    expect(files.some((f) => f.path.includes('bonus.mkv'))).toBe(true)
  })

  test('does not create file_error events when all files succeed', async () => {
    const media = await seedMedia(join(tmpDir, 'valid'))

    await new Scanner().scan(media.id)

    const events = await DbEvents.getByMediaId(media.id)
    const fileErrors = events.filter((e) => e.event_type === 'file_error')

    expect(fileErrors).toHaveLength(0)
  })

  test('deletes previous file_error events at scan start', async () => {
    const media = await seedMedia(join(tmpDir, 'good'))

    await DbEvents.create({
      media_id: media.id,
      entity_type: 'scan',
      entity_id: '/old/failed.mkv',
      event_type: 'file_error',
      message: 'old error',
    })

    const before = await DbEvents.getByMediaId(media.id)

    expect(before.filter((e) => e.event_type === 'file_error')).toHaveLength(1)

    await new Scanner().scan(media.id)

    const after = await DbEvents.getByMediaId(media.id)
    const fileErrors = after.filter((e) => e.event_type === 'file_error')

    expect(fileErrors).toHaveLength(0)
  })
})

describe('Scanner completion signal', () => {
  test('publishes completion event after scanning all files', async () => {
    const media = await seedMedia(join(tmpDir, 'good'))

    const events: { media_id: string; current: number; total: number }[] = []
    const controller = new AbortController()

    const collecting = (async () => {
      for await (const event of PubSub.subscribe(
        'scan_progress',
        controller.signal
      )) {
        events.push(event)
      }
    })().catch(() => {})

    await new Scanner().scan(media.id)

    await Bun.sleep(10)
    controller.abort()
    await collecting

    const lastEvent = events.at(-1)

    expect(lastEvent).toBeDefined()
    expect(lastEvent!.media_id).toBe(media.id)
    expect(lastEvent!.current).toBe(lastEvent!.total)
  })

  test('publishes scan_completed when no new files found', async () => {
    const media = await TestSeed.library.matrix()
    const filePath = join(tmpDir, 'good/movie.mkv')

    const download = await DbDownloads.create({
      media_id: media.id,
      source_id: 'pre-scanned',
      download_url: 'magnet:pre-scanned',
      status: 'completed',
      content_path: join(tmpDir, 'good'),
    })

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: filePath,
      size: 1000,
    })

    const events: { media_id: string }[] = []
    const controller = new AbortController()

    const collecting = (async () => {
      for await (const event of PubSub.subscribe(
        'scan_completed',
        controller.signal
      )) {
        events.push(event)
      }
    })().catch(() => {})

    await new Scanner().scan(media.id)

    await Bun.sleep(10)
    controller.abort()
    await collecting

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ media_id: media.id })
  })

  test('publishes scan_completed after scanning all files', async () => {
    const media = await seedMedia(join(tmpDir, 'good'))

    const events: { media_id: string }[] = []
    const controller = new AbortController()

    const collecting = (async () => {
      for await (const event of PubSub.subscribe(
        'scan_completed',
        controller.signal
      )) {
        events.push(event)
      }
    })().catch(() => {})

    await new Scanner().scan(media.id)

    await Bun.sleep(10)
    controller.abort()
    await collecting

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ media_id: media.id })
  })
})

describe('Scanner ripper content path idempotency', () => {
  test('does not double-append episode dir when content_path already ends in episode dir', async () => {
    // Formatters.seasonEpisodeDir(1, 1) === 's01e01'
    // If scanner does not guard, second call would look in s01e01/s01e01
    const episodeDir = join(tmpDir, 's01e01')
    const episodeFile = join(episodeDir, 'episode.mkv')

    await MediaFixtures.copy(refMkv, episodeFile)

    const media = await TestSeed.library.matrix()

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'ripper:idempotent',
      download_url: 'imdb:ripper:idempotent',
      source: 'ripper',
      status: 'completed',
      content_path: episodeDir,
      season_number: 1,
      episode_number: 1,
    })

    const files = await new Scanner().scan(media.id)

    expect(files.some((f) => f.path === episodeFile)).toBe(true)
  })
})
