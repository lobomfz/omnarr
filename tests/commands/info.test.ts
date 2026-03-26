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

import { InfoCommand } from '@/commands/info'
import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { Scanner } from '@/scanner'
import { deriveId } from '@/utils'

import { MediaFixtures } from '../fixtures/media'
import { seedDownloadWithTracks } from '../player/seed'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-info-cmd-'))
const refMkv = join(tmpDir, 'ref-subs.mkv')

beforeAll(async () => {
  await MediaFixtures.generateWithSubs(refMkv, tmpDir)
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'media/The Matrix (1999)/movie.mkv')
  )
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

beforeEach(() => {
  database.reset()
})

async function seedMedia() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    year: 1999,
  })

  return await DbMedia.create({
    id: deriveId('603:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/movies',
  })
}

describe('info command', () => {
  test('returns json with media, downloads, files and tracks', async () => {
    const media = await seedMedia()

    await DbDownloads.create({
      media_id: media.id,
      info_hash: 'test_hash',
      download_url: 'magnet:test',
      status: 'completed',
      content_path: join(tmpDir, 'media/The Matrix (1999)'),
    })

    await new Scanner().scan(media.id)

    const result = await testCommand(InfoCommand, {
      args: [media.id],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)

    expect(data.title).toBe('The Matrix')
    expect(data.year).toBe(1999)
    expect(data.media_type).toBe('movie')
    expect(data.downloads).toHaveLength(1)
    expect(data.downloads[0].status).toBe('completed')
    expect(data.downloads[0].files).toHaveLength(1)
    expect(data.downloads[0].files[0].tracks.length).toBeGreaterThanOrEqual(3)
  })

  test('outputs formatted text without --json', async () => {
    const media = await seedMedia()

    await DbDownloads.create({
      media_id: media.id,
      info_hash: 'test_hash',
      download_url: 'magnet:test',
      status: 'completed',
      content_path: join(tmpDir, 'media/The Matrix (1999)'),
    })

    await new Scanner().scan(media.id)

    const result = await testCommand(InfoCommand, {
      args: [media.id],
      flags: {},
    })

    expect(result.stdout).toContain('[movie] The Matrix (1999)')
    expect(result.stdout).toContain('completed')
    expect(result.stdout).toContain('movie.mkv')
    expect(result.stdout).toContain('video')
    expect(result.stdout).toContain('audio')
    expect(result.stdout).toContain('subtitle')
  })

  test('shows media with no downloads or files', async () => {
    const media = await seedMedia()

    const result = await testCommand(InfoCommand, {
      args: [media.id],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)

    expect(data.title).toBe('The Matrix')
    expect(data.downloads).toHaveLength(0)
  })

  test('shows multiple downloads', async () => {
    const media = await seedMedia()

    await DbDownloads.create({
      media_id: media.id,
      info_hash: 'hash_1',
      download_url: 'magnet:1',
      status: 'completed',
      content_path: '/downloads/release1',
    })

    await DbDownloads.create({
      media_id: media.id,
      info_hash: 'hash_2',
      download_url: 'magnet:2',
      status: 'downloading',
    })

    const result = await testCommand(InfoCommand, {
      args: [media.id],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)

    expect(data.downloads).toHaveLength(2)
  })

  test('errors when media_id does not exist', async () => {
    const result = await testCommand(InfoCommand, {
      args: ['NOEXIST'],
      flags: {},
    })

    expect(result.exitCode).not.toBe(0)
  })

  test('shows per-type track indices matching play command numbering', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        language: 'eng',
      },
      {
        stream_index: 2,
        stream_type: 'audio',
        codec_name: 'ac3',
        is_default: false,
        language: 'por',
      },
    ])

    const result = await testCommand(InfoCommand, {
      args: [media.id],
      flags: {},
    })

    expect(result.stdout).toContain('video 0:')
    expect(result.stdout).toContain('audio 0:')
    expect(result.stdout).toContain('audio 1:')
  })
})
