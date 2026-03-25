import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterAll,
} from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { testCommand } from '@bunli/test'

import { ScanCommand } from '@/commands/scan'
import { database } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'

import { MediaFixtures } from '../fixtures/media'

const tmpDir = mkdtempSync(join(tmpdir(), 'omnarr-scan-cmd-'))
const refSubsMkv = join(tmpDir, 'ref-subs.mkv')

beforeAll(async () => {
  await MediaFixtures.generateWithSubs(refSubsMkv, tmpDir)

  MediaFixtures.copy(
    refSubsMkv,
    join(tmpDir, 'movies/The Matrix (1999)/movie.mkv')
  )
  mkdirSync(join(tmpDir, 'empty/The Matrix (1999)'), { recursive: true })
  MediaFixtures.writeDummy(join(tmpDir, 'empty/The Matrix (1999)/info.nfo'))
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true })
})

beforeEach(() => {
  database.reset('media_tracks')
  database.reset('media_files')
  database.reset('media')
  database.reset('tmdb_media')
})

async function seedMedia(rootFolder: string) {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    year: 1999,
  })

  return await DbMedia.create({
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: rootFolder,
  })
}

describe('scan command', () => {
  test('outputs scanned files and tracks as json', async () => {
    const media = await seedMedia(join(tmpDir, 'movies'))

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
  })

  test('outputs formatted text without --json', async () => {
    const media = await seedMedia(join(tmpDir, 'movies'))

    const result = await testCommand(ScanCommand, {
      args: [String(media.id)],
      flags: {},
    })

    expect(result.stdout).toContain('movie.mkv')
    expect(result.stdout).toContain('video')
    expect(result.stdout).toContain('audio')
    expect(result.stdout).toContain('subtitle')
  })

  test('shows message when no files found', async () => {
    const media = await seedMedia(join(tmpDir, 'empty'))

    const result = await testCommand(ScanCommand, {
      args: [String(media.id)],
      flags: {},
    })

    expect(result.stdout).toContain('No media files found.')
  })

  test('errors when media_id does not exist', async () => {
    const result = await testCommand(ScanCommand, {
      args: ['999'],
      flags: {},
    })

    expect(result.exitCode).not.toBe(0)
  })
})
