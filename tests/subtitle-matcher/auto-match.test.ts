import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'

import { PubSub } from '@/api/pubsub'
import { SubtitleMatcher } from '@/core/subtitle-matcher'
import { db } from '@/db/connection'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'
import { DbReleases } from '@/db/releases'
import { config } from '@/lib/config'

import { TestSeed } from '../helpers/seed'
import { SubdlMock } from '../mocks/subdl'

const tracksDir = config.root_folders!.tracks!

const VAD_TIMESTAMPS = new Float32Array([5.0, 5.5, 500.0, 500.5])

async function setupMedia() {
  const media = await TestSeed.library.matrix()

  const { file } = await TestSeed.player.downloadWithTracks(
    media.id,
    'VIDEO_HASH_001',
    '/movies/The Matrix (1999)/movie.mkv',
    [
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
      },
    ],
    { duration: 8160 }
  )
  const tracks = await DbMediaTracks.getByMediaFileId(file.id)
  const audioTrack = tracks.find((track) => track.stream_type === 'audio')!

  await DbMediaVad.create({
    track_id: audioTrack.id,
    data: new Uint8Array(VAD_TIMESTAMPS.buffer),
  })

  await DbReleases.upsert(603, 'movie', [
    {
      source_id: 'VIDEO_HASH_001',
      indexer_source: 'yts',
      name: 'The.Matrix.1999.1080p.BluRay.x264-GROUP',
      size: 8_000_000_000,
      seeders: 100,
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
  TestSeed.reset()
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

    const result = await matcher.match({})

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

    const result = await matcher.match({})

    expect(result.matched).not.toBeNull()
    expect(result.matched!.name).toBe('The.Matrix.1999.1080p.BluRay.DTS-GROUP')
    expect(result.tested.length).toBeGreaterThan(1)
  })

  test('creates download records for tested subtitles', async () => {
    const media = await setupMedia()
    await seedSubtitles()

    const matcher = new SubtitleMatcher({ id: media.id })

    await matcher.match({})

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

    await matcher.match({})

    const srtFiles = await Array.fromAsync(
      new Bun.Glob('**/*.srt').scan({ cwd: tracksDir })
    )

    expect(srtFiles.length).toBeGreaterThanOrEqual(1)
  })

  test('publishes progress to PubSub', async () => {
    const media = await setupMedia()
    await seedSubtitles()

    const events: { name: string; status: string }[] = []
    const ac = new AbortController()
    const subscription = PubSub.subscribe('subtitle_progress', ac.signal)

    const collectEvents = (async () => {
      for await (const event of subscription) {
        events.push({ name: event.name, status: event.status })
      }
    })()

    const matcher = new SubtitleMatcher({ id: media.id })

    await matcher.match({})

    ac.abort()
    await collectEvents.catch(() => {})

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

    const result = await matcher.match({})

    expect(result.tested.length).toBeLessThanOrEqual(5)
  })

  test('returns empty tested when no subtitles found', async () => {
    await setupMedia()

    const media2 = await TestSeed.library.movie({
      tmdbId: 9999,
      title: 'No Subs Movie',
      year: 2024,
      imdbId: 'tt9999999',
    })

    const { file } = await TestSeed.player.downloadWithTracks(
      media2.id,
      'VID_9999',
      '/movies/nosubs/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ]
    )
    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const audioTrack = tracks.find((track) => track.stream_type === 'audio')!

    await DbMediaVad.create({
      track_id: audioTrack.id,
      data: new Uint8Array(VAD_TIMESTAMPS.buffer),
    })

    const matcher = new SubtitleMatcher({ id: media2.id })

    const result = await matcher.match({})

    expect(result.matched).toBeNull()
    expect(result.tested).toHaveLength(0)
  })
})

describe('SubtitleMatcher.match edge cases', () => {
  test('throws when media has no VAD data', async () => {
    const media = await TestSeed.library.movie({
      tmdbId: 700,
      title: 'No VAD Movie',
      year: 2000,
      imdbId: 'tt0700000',
    })

    await TestSeed.player.downloadWithTracks(
      media.id,
      'VID_NOVAD',
      '/movies/novad/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
      ]
    )

    const matcher = new SubtitleMatcher({ id: media.id })

    expect(() => matcher.match({})).toThrow('NO_VAD_DATA')
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
    const result = await matcher.match({})

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
    const media = await TestSeed.library.movie({
      tmdbId: 800,
      title: 'No Release Movie',
      year: 2001,
      imdbId: 'tt0800000',
    })

    const { file } = await TestSeed.player.downloadWithTracks(
      media.id,
      'VID_NOREL',
      '/movies/norelease/movie.mkv',
      [
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
        },
      ],
      { duration: 8160 }
    )
    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const audioTrack = tracks.find((track) => track.stream_type === 'audio')!

    await DbMediaVad.create({
      track_id: audioTrack.id,
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
    const result = await matcher.match({})

    expect(result.tested.length).toBeGreaterThanOrEqual(1)
    expect(result.matched).not.toBeNull()
    expect(result.matched!.confidence).toBeGreaterThanOrEqual(15)
  })
})
