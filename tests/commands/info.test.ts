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
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbSeasons } from '@/db/seasons'
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
    imdb_id: 'tt0133093',
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
      source_id: 'test_hash',
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
      source_id: 'test_hash',
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
      source_id: 'hash_1',
      download_url: 'magnet:1',
      status: 'completed',
      content_path: '/downloads/release1',
    })

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'hash_2',
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

async function seedTvMediaForInfo() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 1396,
    media_type: 'tv',
    title: 'Breaking Bad',
    imdb_id: 'tt0903747',
    year: 2008,
  })

  const media = await DbMedia.create({
    id: deriveId('1396:tv'),
    tmdb_media_id: tmdb.id,
    media_type: 'tv',
    root_folder: '/tv',
  })

  const seasons = await DbSeasons.upsert([
    {
      tmdb_media_id: tmdb.id,
      season_number: 1,
      title: 'Season 1',
      episode_count: 3,
    },
  ])

  const episodes = await DbEpisodes.upsert([
    { season_id: seasons[0].id, episode_number: 1, title: 'Pilot' },
    {
      season_id: seasons[0].id,
      episode_number: 2,
      title: "Cat's in the Bag...",
    },
    {
      season_id: seasons[0].id,
      episode_number: 3,
      title: "...And the Bag's in the River",
    },
  ])

  const download = await DbDownloads.create({
    media_id: media.id,
    source_id: 'tv_hash',
    download_url: 'magnet:test',
    status: 'completed',
    content_path: '/tv/Breaking Bad (2008)',
  })

  const file = await DbMediaFiles.create({
    media_id: media.id,
    download_id: download.id,
    episode_id: episodes[0].id,
    path: '/tv/Breaking Bad (2008)/Breaking.Bad.S01E01.mkv',
    size: 8_000_000_000,
    duration: 3492,
    format_name: 'matroska',
  })

  await DbMediaTracks.createMany([
    {
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
      width: 1920,
      height: 1080,
    },
    {
      media_file_id: file.id,
      stream_index: 1,
      stream_type: 'audio',
      codec_name: 'aac',
      is_default: true,
      language: 'eng',
    },
  ])

  return { media, seasons, episodes }
}

describe('info command — TV', () => {
  test('returns season/episode hierarchy in JSON', async () => {
    const { media } = await seedTvMediaForInfo()

    const result = await testCommand(InfoCommand, {
      args: [media.id],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)

    expect(data.media_type).toBe('tv')
    expect(data.seasons).toHaveLength(1)
    expect(data.seasons[0].season_number).toBe(1)
    expect(data.seasons[0].episodes).toHaveLength(3)
    expect(data.seasons[0].episodes[0].files).toHaveLength(1)
    expect(data.seasons[0].episodes[1].files).toHaveLength(0)
    expect(data.seasons[0].episodes[2].files).toHaveLength(0)
  })

  test('displays season/episode hierarchy in formatted text', async () => {
    await seedTvMediaForInfo()

    const result = await testCommand(InfoCommand, {
      args: [deriveId('1396:tv')],
      flags: {},
    })

    expect(result.stdout).toContain('[tv] Breaking Bad (2008)')
    expect(result.stdout).toContain('Season 1')
    expect(result.stdout).toContain('E01  Pilot')
    expect(result.stdout).toContain('Breaking.Bad.S01E01.mkv')
    expect(result.stdout).toContain('h264')
  })

  test('hides episodes without files from display', async () => {
    await seedTvMediaForInfo()

    const result = await testCommand(InfoCommand, {
      args: [deriveId('1396:tv')],
      flags: {},
    })

    expect(result.stdout).toContain('E01')
    expect(result.stdout).not.toContain('E02')
    expect(result.stdout).not.toContain('E03')
  })

  test('--season filters to matching season', async () => {
    const { media } = await seedTvMediaForInfo()

    const result = await testCommand(InfoCommand, {
      args: [media.id],
      flags: { json: true, season: '1' },
    })

    const data = JSON.parse(result.stdout)

    expect(data.seasons).toHaveLength(1)
    expect(data.seasons[0].season_number).toBe(1)
  })

  test('--season --episode filters to matching episode', async () => {
    const { media } = await seedTvMediaForInfo()

    const result = await testCommand(InfoCommand, {
      args: [media.id],
      flags: { json: true, season: '1', episode: '1' },
    })

    const data = JSON.parse(result.stdout)

    expect(data.seasons).toHaveLength(1)
    expect(data.seasons[0].episodes).toHaveLength(1)
    expect(data.seasons[0].episodes[0].episode_number).toBe(1)
  })

  test('--season with no match returns empty seasons', async () => {
    const { media } = await seedTvMediaForInfo()

    const result = await testCommand(InfoCommand, {
      args: [media.id],
      flags: { json: true, season: '99' },
    })

    const data = JSON.parse(result.stdout)

    expect(data.seasons).toHaveLength(0)
  })

  test('shows Season 0 as Specials', async () => {
    const { media } = await seedTvMediaForInfo()

    const specials = await DbSeasons.upsert([
      {
        tmdb_media_id: media.tmdb_media_id,
        season_number: 0,
        episode_count: 1,
      },
    ])

    const episodes = await DbEpisodes.upsert([
      { season_id: specials[0].id, episode_number: 1, title: 'Making of' },
    ])

    const download = await database.kysely
      .selectFrom('downloads')
      .select('id')
      .executeTakeFirstOrThrow()

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      episode_id: episodes[0].id,
      path: '/tv/Breaking Bad (2008)/special.mkv',
      size: 500_000_000,
      format_name: 'matroska',
    })

    const result = await testCommand(InfoCommand, {
      args: [media.id],
      flags: {},
    })

    expect(result.stdout).toContain('Specials')
    expect(result.stdout).not.toContain('Season 0')
  })
})
