import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'

import { testCommand } from '@bunli/test'

import { SubtitlesCommand } from '@/commands/subtitles'
import { config } from '@/lib/config'
import { database, db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'
import { DbReleases } from '@/db/releases'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/lib/utils'

import { SubdlMock } from '../mocks/subdl'

beforeEach(() => {
  database.reset()
})

async function setupMovie() {
  const tmdb = await db
    .insertInto('tmdb_media')
    .values({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      year: 1999,
      imdb_id: 'tt0133093',
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  await db
    .insertInto('media')
    .values({
      id: 'MTX001',
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/tmp/movies',
    })
    .execute()

  return 'MTX001'
}

async function setupTvShow() {
  const tmdb = await db
    .insertInto('tmdb_media')
    .values({
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
      year: 2008,
      imdb_id: 'tt0903747',
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  await db
    .insertInto('media')
    .values({
      id: 'BRB001',
      tmdb_media_id: tmdb.id,
      media_type: 'tv',
      root_folder: '/tmp/tv',
    })
    .execute()

  return 'BRB001'
}

describe('subtitles command', () => {
  test('returns subtitles for movie', async () => {
    const mediaId = await setupMovie()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(2)
    expect(data[0].id).toHaveLength(6)
  })

  test('caches results in releases table', async () => {
    const mediaId = await setupMovie()

    await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true },
    })

    const releases = await db
      .selectFrom('releases')
      .where('indexer_source', '=', 'subdl')
      .selectAll()
      .execute()

    expect(releases).toHaveLength(2)
    expect(releases[0].download_url).toContain('/subtitle/')
  })

  test('--lang overrides config languages', async () => {
    const mediaId = await setupMovie()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true, lang: 'FR' },
    })

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(1)
    expect(data[0].name).toContain('FR')
  })

  test('TV requires --season and --episode', async () => {
    const mediaId = await setupTvShow()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true },
    })

    expect(result.exitCode).not.toBe(0)
  })

  test('TV search with --season and --episode', async () => {
    const mediaId = await setupTvShow()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true, season: '1', episode: '1' },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(1)
    expect(data[0].name).toContain('S01E01')
  })

  test('errors for unknown media', async () => {
    const result = await testCommand(SubtitlesCommand, {
      args: ['XXXXXX'],
      flags: { json: true },
    })

    expect(result.exitCode).not.toBe(0)
  })

  test('no releases before search', async () => {
    const releases = await db
      .selectFrom('releases')
      .where('indexer_source', '=', 'subdl')
      .selectAll()
      .execute()

    expect(releases).toHaveLength(0)
  })

  test('errors when media has no IMDB ID', async () => {
    const tmdb = await db
      .insertInto('tmdb_media')
      .values({
        tmdb_id: 999,
        media_type: 'movie',
        title: 'No IMDB Movie',
        year: 2020,
        imdb_id: '',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('media')
      .values({
        id: deriveId('999:movie'),
        tmdb_media_id: tmdb.id,
        media_type: 'movie',
        root_folder: '/tmp/movies',
      })
      .execute()

    const result = await testCommand(SubtitlesCommand, {
      args: [deriveId('999:movie')],
      flags: { json: true },
    })

    expect(result.exitCode).not.toBe(0)
  })
})

const tracksDir = config.root_folders!.tracks!
const VAD_TIMESTAMPS = new Float32Array([5.0, 5.5, 500.0, 500.5])

async function setupAutoMatch() {
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
    root_folder: '/tmp/omnarr-test-movies',
  })

  const download = await DbDownloads.create({
    media_id: media.id,
    source_id: 'VIDEO_HASH_001',
    download_url: 'magnet:VIDEO_HASH_001',
    status: 'completed',
    content_path: '/movies/The Matrix (1999)',
  })

  const file = await DbMediaFiles.create({
    media_id: media.id,
    download_id: download.id,
    path: '/movies/The Matrix (1999)/movie.mkv',
    size: 8_000_000_000,
    duration: 8160,
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
  ])

  await DbMediaVad.create({
    media_file_id: file.id,
    data: new Uint8Array(VAD_TIMESTAMPS.buffer),
  })

  await DbReleases.upsert(603, 'movie', [
    {
      source_id: 'VIDEO_HASH_001',
      indexer_source: 'yts',
      name: 'The.Matrix.1999.1080p.BluRay.x264-GROUP',
      size: 8_000_000_000,
      imdb_id: 'tt0133093',
      resolution: '1080p',
      codec: 'x264',
      hdr: [],
      download_url: 'magnet:VIDEO_HASH_001',
    },
  ])

  return media.id
}

async function cleanAutoMatch() {
  await SubdlMock.db.deleteFrom('subtitles').where('id', '>=', 100).execute()
  await rm(tracksDir, { recursive: true }).catch(() => {})
}

describe('subtitles --auto --json', () => {
  beforeEach(async () => {
    await cleanAutoMatch()
  })

  afterAll(async () => {
    await cleanAutoMatch()
  })

  test('returns matched result with confidence scores', async () => {
    const mediaId = await setupAutoMatch()

    await SubdlMock.db
      .insertInto('subtitles')
      .values([
        {
          id: 500,
          release_name: 'The.Matrix.1999.1080p.BluRay.x264-GROUP',
          name: 'json-test-sub',
          lang: 'english',
          language: 'EN',
          author: 'matcher',
          url: '/subtitle/good-sync-500.zip',
          imdb_id: 'tt0133093',
        },
      ])
      .execute()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true, auto: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data.matched).not.toBeNull()
    expect(data.matched.confidence).toBeTypeOf('number')
    expect(data.matched.offset).toBeTypeOf('number')
    expect(data.matched.name).toBeTypeOf('string')
    expect(data.matched.status).toBe('matched')
    expect(data.tested).toBeInstanceOf(Array)
    expect(data.tested.length).toBeGreaterThanOrEqual(1)
  })

  test('returns null matched with tested array on exhaustion', async () => {
    const mediaId = await setupAutoMatch()

    await SubdlMock.db
      .insertInto('subtitles')
      .values(
        Array.from({ length: 3 }, (_, i) => ({
          id: 600 + i,
          release_name: `The.Matrix.1999.${720 + i}p-GRP${i}`,
          name: `exhaust-cmd-${i}`,
          lang: 'english',
          language: 'EN',
          author: 'matcher',
          url: `/subtitle/bad-sync-${600 + i}.zip`,
          imdb_id: 'tt0133093',
        }))
      )
      .execute()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true, auto: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data.matched).toBeNull()
    expect(data.tested.length).toBeGreaterThanOrEqual(1)

    for (const attempt of data.tested) {
      expect(attempt.name).toBeTypeOf('string')
      expect(attempt.status).toBe('no-match')
    }
  })

  test('errors when media has no VAD data', async () => {
    const tmdb = await DbTmdbMedia.upsert({
      tmdb_id: 700,
      media_type: 'movie',
      title: 'No VAD Movie',
      imdb_id: 'tt0700000',
      year: 2000,
    })

    const media = await DbMedia.create({
      id: deriveId('700:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/tmp/omnarr-test-movies',
    })

    const download = await DbDownloads.create({
      media_id: media.id,
      source_id: 'VID_NOVAD',
      download_url: 'magnet:VID_NOVAD',
      status: 'completed',
      content_path: '/movies/novad',
    })

    const file = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/novad/movie.mkv',
      size: 1_000_000,
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
    ])

    const result = await testCommand(SubtitlesCommand, {
      args: [media.id],
      flags: { json: true, auto: true },
    })

    expect(result.exitCode).not.toBe(0)
  })
})
