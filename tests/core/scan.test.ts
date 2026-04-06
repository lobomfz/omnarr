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

import { Scanner } from '@/core/scanner'
import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbEvents } from '@/db/events'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/lib/utils'

import { MediaFixtures } from '../fixtures/media'

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
  database.reset()
})

async function seedMedia(contentPath: string) {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    imdb_id: 'tt0133093',
    year: 1999,
  })

  const media = await DbMedia.create({
    id: deriveId('603:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/movies',
  })

  await DbDownloads.create({
    media_id: media.id,
    source_id: 'test_hash',
    download_url: 'magnet:test',
    status: 'completed',
    content_path: contentPath,
  })

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
})
