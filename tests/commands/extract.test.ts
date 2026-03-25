import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterAll,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { testCommand } from '@bunli/test'

import { ExtractCommand } from '@/commands/extract'
import { config } from '@/config'
import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { Scanner } from '@/scanner'
import { deriveId } from '@/utils'

import { MediaFixtures } from '../fixtures/media'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-extract-cmd-'))
const tracksDir = join(tmpDir, 'tracks')
const refMkv = join(tmpDir, 'ref-subs.mkv')
const savedTracksRoot = config.root_folders?.tracks

beforeAll(async () => {
  config.root_folders!.tracks = tracksDir
  await MediaFixtures.generateWithSubs(refMkv, tmpDir)
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'media/The Matrix (1999)/movie.mkv')
  )
})

afterAll(async () => {
  config.root_folders!.tracks = savedTracksRoot
  await rm(tmpDir, { recursive: true })
})

beforeEach(async () => {
  await rm(tracksDir, { recursive: true, force: true })
  database.reset('media_tracks')
  database.reset('media_files')
  database.reset('downloads')
  database.reset('media')
  database.reset('tmdb_media')
})

async function seedAndScan() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
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
    info_hash: 'test_hash',
    download_url: 'magnet:test',
    status: 'completed',
    content_path: join(tmpDir, 'media/The Matrix (1999)'),
  })

  await new Scanner().scan(media.id)

  return media
}

describe('extract command', () => {
  test('outputs extracted tracks as json', async () => {
    const media = await seedAndScan()

    const result = await testCommand(ExtractCommand, {
      args: [String(media.id)],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)

    expect(data.tracks.length).toBeGreaterThanOrEqual(3)
    expect(data.failed).toHaveLength(0)

    for (const track of data.tracks) {
      expect(track.path).not.toBeNull()
      expect(track.size).toBeGreaterThan(0)
    }
  })

  test('outputs formatted text without --json', async () => {
    const media = await seedAndScan()

    const result = await testCommand(ExtractCommand, {
      args: [String(media.id)],
      flags: {},
    })

    expect(result.stdout).toContain('video')
    expect(result.stdout).toContain('audio')
    expect(result.stdout).toContain('subtitle')
  })

  test('shows message when no tracks to extract', async () => {
    const tmdb = await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      year: 1999,
    })

    const media = await DbMedia.create({
      id: deriveId('603:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: join(tmpDir, 'media'),
    })

    const result = await testCommand(ExtractCommand, {
      args: [String(media.id)],
      flags: {},
    })

    expect(result.stdout).toContain('No tracks')
  })

  test('errors when media_id does not exist', async () => {
    const result = await testCommand(ExtractCommand, {
      args: ['999'],
      flags: {},
    })

    expect(result.exitCode).not.toBe(0)
  })

  test('errors when tracks root folder not configured', async () => {
    config.root_folders!.tracks = undefined

    const result = await testCommand(ExtractCommand, {
      args: ['1'],
      flags: {},
    })

    config.root_folders!.tracks = tracksDir

    expect(result.exitCode).not.toBe(0)
  })

  test('reports failures in output', async () => {
    const media = await seedAndScan()

    const fakeDl = await DbDownloads.create({
      media_id: media.id,
      info_hash: 'fake_hash',
      download_url: 'magnet:fake',
      status: 'completed',
    })

    const fakeFile = await DbMediaFiles.create({
      media_id: media.id,
      download_id: fakeDl.id,
      path: '/nonexistent/fake.mkv',
      size: 0,
    })

    await DbMediaTracks.create({
      media_file_id: fakeFile.id,
      stream_index: 99,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: false,
    })

    const result = await testCommand(ExtractCommand, {
      args: [String(media.id)],
      flags: {},
    })

    expect(result.stdout).toContain('→')
    expect(result.stdout).toMatch(/FAILED/i)
  })
})
