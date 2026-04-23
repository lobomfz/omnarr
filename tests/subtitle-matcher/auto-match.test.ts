import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'

import { SubtitleMatcher } from '@/core/subtitle-matcher'
import { database, db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'
import { DbReleases } from '@/db/releases'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { config } from '@/lib/config'
import { deriveId } from '@/lib/utils'

import { SubdlMock } from '../mocks/subdl'

const tracksDir = config.root_folders!.tracks!

const VAD_TIMESTAMPS = new Float32Array([5.0, 5.5, 500.0, 500.5])

async function setupMedia() {
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
    {
      media_file_id: file.id,
      stream_index: 1,
      stream_type: 'audio',
      codec_name: 'aac',
      is_default: true,
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
      seeders: 0,
      imdb_id: 'tt0133093',
      resolution: '1080p',
      codec: 'x264',
      hdr: [],
      download_url: 'magnet:VIDEO_HASH_001',
    },
  ])

  return media
}

async function seedSubtitles() {
  await SubdlMock.db
    .insertInto('subtitles')
    .values([
      {
        id: 100,
        release_name: 'The.Matrix.1999.1080p.BluRay.x264-GROUP',
        name: 'good-sync-sub',
        lang: 'english',
        language: 'EN',
        author: 'matcher',
        url: '/subtitle/good-sync-100.zip',
        imdb_id: 'tt0133093',
      },
      {
        id: 101,
        release_name: 'The.Matrix.1999.720p.HDTV-OTHER',
        name: 'bad-sync-sub',
        lang: 'english',
        language: 'EN',
        author: 'matcher',
        url: '/subtitle/bad-sync-101.zip',
        imdb_id: 'tt0133093',
      },
      {
        id: 102,
        release_name: 'The.Matrix.1999.DVDRip-THIRD',
        name: 'bad-sync-sub-2',
        lang: 'english',
        language: 'EN',
        author: 'matcher',
        url: '/subtitle/bad-sync-102.zip',
        imdb_id: 'tt0133093',
      },
    ])
    .execute()
}

async function cleanSubtitles() {
  await SubdlMock.db.deleteFrom('subtitles').where('id', '>=', 100).execute()
}

beforeEach(async () => {
  database.reset()
  await cleanSubtitles()
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

afterAll(async () => {
  await cleanSubtitles()
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

describe('SubtitleMatcher.match', () => {
  test('finds matching subtitle on first try when ranked first', async () => {
    const media = await setupMedia()
    await seedSubtitles()

    const matcher = new SubtitleMatcher({ id: media.id })

    const result = await matcher.match({}, () => {})

    expect(result.matched).not.toBeNull()
    expect(result.matched!.confidence).toBeGreaterThanOrEqual(15)
    expect(result.matched!.name).toBe('The.Matrix.1999.1080p.BluRay.x264-GROUP')
  })

  test('tries multiple subtitles before finding match', async () => {
    const media = await setupMedia()

    await SubdlMock.db
      .insertInto('subtitles')
      .values([
        {
          id: 100,
          release_name: 'The.Matrix.1999.1080p.BluRay.x264-GROUP',
          name: 'bad-first',
          lang: 'english',
          language: 'EN',
          author: 'matcher',
          url: '/subtitle/bad-sync-100.zip',
          imdb_id: 'tt0133093',
        },
        {
          id: 101,
          release_name: 'The.Matrix.1999.1080p.BluRay.DTS-GROUP',
          name: 'good-second',
          lang: 'english',
          language: 'EN',
          author: 'matcher',
          url: '/subtitle/good-sync-101.zip',
          imdb_id: 'tt0133093',
        },
      ])
      .execute()

    const matcher = new SubtitleMatcher({ id: media.id })

    const result = await matcher.match({}, () => {})

    expect(result.matched).not.toBeNull()
    expect(result.matched!.name).toBe('The.Matrix.1999.1080p.BluRay.DTS-GROUP')
    expect(result.tested.length).toBeGreaterThan(1)
  })

  test('creates download records for tested subtitles', async () => {
    const media = await setupMedia()
    await seedSubtitles()

    const matcher = new SubtitleMatcher({ id: media.id })

    await matcher.match({}, () => {})

    const downloads = await db
      .selectFrom('downloads')
      .where('source', '=', 'subtitle')
      .selectAll()
      .execute()

    expect(downloads.length).toBeGreaterThanOrEqual(1)
    expect(downloads[0].status).toBe('completed')
    expect(downloads[0].content_path).toContain('.srt')
  })

  test('saves subtitle files to tracks dir', async () => {
    const media = await setupMedia()
    await seedSubtitles()

    const matcher = new SubtitleMatcher({ id: media.id })

    await matcher.match({}, () => {})

    const srtFiles = await Array.fromAsync(
      new Bun.Glob('**/*.srt').scan({ cwd: tracksDir })
    )

    expect(srtFiles.length).toBeGreaterThanOrEqual(1)
  })

  test('calls onProgress for each attempt', async () => {
    const media = await setupMedia()
    await seedSubtitles()

    const matcher = new SubtitleMatcher({ id: media.id })
    const events: { name: string; status: string }[] = []

    await matcher.match({}, (info) => {
      events.push({ name: info.name, status: info.status })
    })

    expect(events.some((e) => e.status === 'downloading')).toBe(true)
    expect(
      events.some((e) => e.status === 'matched' || e.status === 'no-match')
    ).toBe(true)
  })

  test('limits to 5 attempts', async () => {
    const media = await setupMedia()

    await SubdlMock.db
      .insertInto('subtitles')
      .values(
        Array.from({ length: 8 }, (_, i) => ({
          id: 200 + i,
          release_name: `The.Matrix.1999.${i}p-GRP${i}`,
          name: `bad-sub-${i}`,
          lang: 'english',
          language: 'EN',
          author: 'matcher',
          url: `/subtitle/bad-sync-${200 + i}.zip`,
          imdb_id: 'tt0133093',
        }))
      )
      .execute()

    const matcher = new SubtitleMatcher({ id: media.id })

    const result = await matcher.match({}, () => {})

    expect(result.tested.length).toBeLessThanOrEqual(5)
  })

  test('returns empty tested when no subtitles found', async () => {
    await setupMedia()

    // Use a media with different IMDB that has no subtitles in mock
    const tmdb2 = await DbTmdbMedia.upsert({
      tmdb_id: 9999,
      media_type: 'movie',
      title: 'No Subs Movie',
      imdb_id: 'tt9999999',
      year: 2024,
    })

    const media2 = await DbMedia.create({
      id: deriveId('9999:movie'),
      tmdb_media_id: tmdb2.id,
      media_type: 'movie',
      root_folder: '/tmp/omnarr-test-movies',
    })

    const dl = await DbDownloads.create({
      media_id: media2.id,
      source_id: 'VID_9999',
      download_url: 'magnet:VID_9999',
      status: 'completed',
      content_path: '/movies/nosubs',
    })

    const file = await DbMediaFiles.create({
      media_id: media2.id,
      download_id: dl.id,
      path: '/movies/nosubs/movie.mkv',
      size: 1_000_000,
    })

    await DbMediaTracks.createMany([
      {
        media_file_id: file.id,
        stream_index: 0,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
      },
    ])

    await DbMediaVad.create({
      media_file_id: file.id,
      data: new Uint8Array(VAD_TIMESTAMPS.buffer),
    })

    const matcher = new SubtitleMatcher({ id: media2.id })

    const result = await matcher.match({}, () => {})

    expect(result.matched).toBeNull()
    expect(result.tested).toHaveLength(0)
  })
})

describe('SubtitleMatcher.match edge cases', () => {
  test('throws when media has no VAD data', async () => {
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

    const matcher = new SubtitleMatcher({ id: media.id })

     expect(() => matcher.match({}, () => {})).toThrow(/No VAD data found/)
  })

  test('returns all tested attempts with confidence on exhaustion', async () => {
    const media = await setupMedia()

    await SubdlMock.db
      .insertInto('subtitles')
      .values(
        Array.from({ length: 5 }, (_, i) => ({
          id: 300 + i,
          release_name: `The.Matrix.1999.${720 + i}p-GRP${i}`,
          name: `exhaust-sub-${i}`,
          lang: 'english',
          language: 'EN',
          author: 'matcher',
          url: `/subtitle/bad-sync-${300 + i}.zip`,
          imdb_id: 'tt0133093',
        }))
      )
      .execute()

    const matcher = new SubtitleMatcher({ id: media.id })
    const result = await matcher.match({}, () => {})

    expect(result.matched).toBeNull()
    expect(result.tested).toHaveLength(5)

    for (const attempt of result.tested) {
      expect(attempt.confidence).toBeTypeOf('number')
      expect(attempt.status).toBe('no-match')
      expect(attempt.name).toBeDefined()
      expect(attempt.offset).toBeTypeOf('number')
    }
  })

  test('proceeds with default order when no reference release exists', async () => {
    const tmdb = await DbTmdbMedia.upsert({
      tmdb_id: 800,
      media_type: 'movie',
      title: 'No Release Movie',
      imdb_id: 'tt0800000',
      year: 2001,
    })

    const media = await DbMedia.create({
      id: deriveId('800:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/tmp/omnarr-test-movies',
    })

    const download = await DbDownloads.create({
      media_id: media.id,
      source_id: 'VID_NOREL',
      download_url: 'magnet:VID_NOREL',
      status: 'completed',
      content_path: '/movies/norelease',
    })

    const file = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/norelease/movie.mkv',
      size: 1_000_000,
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

    await SubdlMock.db
      .insertInto('subtitles')
      .values([
        {
          id: 400,
          release_name: 'No.Release.Movie.2001.1080p.BluRay-GRP',
          name: 'norel-sub',
          lang: 'english',
          language: 'EN',
          author: 'matcher',
          url: '/subtitle/good-sync-400.zip',
          imdb_id: 'tt0800000',
        },
      ])
      .execute()

    const matcher = new SubtitleMatcher({ id: media.id })
    const result = await matcher.match({}, () => {})

    expect(result.tested.length).toBeGreaterThanOrEqual(1)
    expect(result.matched).not.toBeNull()
    expect(result.matched!.confidence).toBeGreaterThanOrEqual(15)
  })
})
