import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterAll,
} from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { testCommand } from '@bunli/test'

import { ScanCommand } from '@/commands/scan'
import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/utils'

import { MediaFixtures } from '../fixtures/media'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-scan-cmd-'))
const refSubsMkv = join(tmpDir, 'ref-subs.mkv')

beforeAll(async () => {
  await MediaFixtures.generateWithSubs(refSubsMkv, tmpDir)

  await MediaFixtures.copy(
    refSubsMkv,
    join(tmpDir, 'movies/The Matrix (1999)/movie.mkv')
  )
  await mkdir(join(tmpDir, 'empty/The Matrix (1999)'), { recursive: true })
  await MediaFixtures.writeDummy(
    join(tmpDir, 'empty/The Matrix (1999)/info.nfo')
  )
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

describe('scan command', () => {
  test('outputs scanned files and tracks as json', async () => {
    const media = await seedMedia(join(tmpDir, 'movies/The Matrix (1999)'))

    const result = await testCommand(ScanCommand, {
      args: [String(media.id)],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(1)
    expect(data[0].path).toContain('movie.mkv')
    expect(data[0].tracks.length).toBeGreaterThanOrEqual(3)

    const types = data[0].tracks.map(
      (t: { stream_type: string }) => t.stream_type
    )

    expect(types).toContain('video')
    expect(types).toContain('audio')
    expect(types).toContain('subtitle')

    expect(data[0].keyframes).toBeGreaterThan(0)
    expect(data[0].has_vad).toBeTruthy()
  })

  test('shows keyframe and vad status in formatted output', async () => {
    const media = await seedMedia(join(tmpDir, 'movies/The Matrix (1999)'))

    const result = await testCommand(ScanCommand, {
      args: [String(media.id)],
      flags: {},
    })

    expect(result.stdout).toContain('keyframes:')
    expect(result.stdout).toContain('vad:')
  })

  test('outputs formatted text without --json', async () => {
    const media = await seedMedia(join(tmpDir, 'movies/The Matrix (1999)'))

    const result = await testCommand(ScanCommand, {
      args: [String(media.id)],
      flags: { json: true },
    })

    expect(result.stdout).toContain('movie.mkv')
    expect(result.stdout).toContain('video')
    expect(result.stdout).toContain('audio')
    expect(result.stdout).toContain('subtitle')
  })

  test('shows message when no files found', async () => {
    const media = await seedMedia(join(tmpDir, 'empty/The Matrix (1999)'))

    const result = await testCommand(ScanCommand, {
      args: [String(media.id)],
      flags: { json: true },
    })

    expect(result.stdout).toContain('No media files found.')
  })

  test('errors when media_id does not exist', async () => {
    const result = await testCommand(ScanCommand, {
      args: ['999'],
      flags: { json: true },
    })

    expect(result.exitCode).not.toBe(0)
  })

  test('force re-scans all files from scratch', async () => {
    const media = await seedMedia(join(tmpDir, 'movies/The Matrix (1999)'))

    await testCommand(ScanCommand, {
      args: [String(media.id)],
      flags: { json: true },
    })

    const filesBefore = await DbMediaFiles.getByMediaId(media.id)

    await testCommand(ScanCommand, {
      args: [String(media.id)],
      flags: { force: true, json: true },
    })

    const filesAfter = await DbMediaFiles.getByMediaId(media.id)

    expect(filesAfter).toHaveLength(1)
    expect(filesAfter[0].id).not.toBe(filesBefore[0].id)
  })
})
