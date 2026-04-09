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
import { DbEvents } from '@/db/events'

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
})
