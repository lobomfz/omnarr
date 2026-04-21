import { describe, expect, test, beforeEach } from 'bun:test'

import { db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

async function seedMedia() {
  const media = await TestSeed.library.matrix()

  const download = await DbDownloads.create({
    media_id: media.id,
    source_id: 'test_hash',
    download_url: 'magnet:test',
    status: 'completed',
    content_path: '/movies/The Matrix (1999)',
  })

  return { media, download }
}

describe('schema - media_files', () => {
  test('create persists a media_file and returns the record', async () => {
    const { media, download } = await seedMedia()

    const file = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })

    expect(file.id).toBeGreaterThan(0)
    expect(file.media_id).toBe(media.id)
    expect(file.download_id).toBe(download.id)
    expect(file.path).toBe('/movies/The Matrix (1999)/The.Matrix.1999.mkv')
    expect(file.size).toBe(8_000_000_000)
    expect(file.format_name).toBeNull()
    expect(file.duration).toBeNull()
    expect(file.scanned_at).toBeInstanceOf(Date)
  })

  test('create accepts format_name and duration', async () => {
    const { media, download } = await seedMedia()

    const file = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
      format_name: 'matroska,webm',
      duration: 8160.5,
    })

    expect(file.format_name).toBe('matroska,webm')
    expect(file.duration).toBe(8160.5)
  })

  test('getByMediaId returns all files of a media', async () => {
    const { media, download } = await seedMedia()

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.Extras.mkv',
      size: 500_000_000,
    })

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files).toHaveLength(2)
  })

  test('getByMediaId returns empty array when no files', async () => {
    const files = await DbMediaFiles.getByMediaId('NONEXISTENT')

    expect(files).toHaveLength(0)
  })

  test('getByPath returns a file by full path', async () => {
    const { media, download } = await seedMedia()
    const path = '/movies/The Matrix (1999)/The.Matrix.1999.mkv'

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path,
      size: 8_000_000_000,
    })

    const found = await DbMediaFiles.getByPath(path)

    expect(found).toBeDefined()
    expect(found!.path).toBe(path)
    expect(found!.media_id).toBe(media.id)
  })

  test('getByPath returns undefined for non-existent path', async () => {
    const found = await DbMediaFiles.getByPath('/does/not/exist.mkv')

    expect(found).toBeUndefined()
  })

  test('deleteByMediaId removes all files of a media', async () => {
    const { media, download } = await seedMedia()

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/file1.mkv',
      size: 8_000_000_000,
    })

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/file2.mkv',
      size: 500_000_000,
    })

    await DbMediaFiles.deleteByMediaId(media.id)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files).toHaveLength(0)
  })

  test('cascade delete: removing media removes its files', async () => {
    const { media, download } = await seedMedia()

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })

    await DbMedia.delete(media.id)

    const allFiles = await db.selectFrom('media_files').selectAll().execute()

    expect(allFiles).toHaveLength(0)
  })

  test('countByMedia returns total file count for a media', async () => {
    const { media, download } = await seedMedia()

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/file1.mkv',
      size: 8_000_000_000,
    })

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/file2.mkv',
      size: 500_000_000,
    })

    const count = await DbMediaFiles.countByMedia(media.id)

    expect(count).toBe(2)
  })

  test('countByMedia filters by episode_id when provided', async () => {
    const { media, episodes } = await TestSeed.library.tv({
      tmdbId: 9999,
      title: 'Test Show',
      year: 2020,
      imdbId: 'tt9999999',
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodeCount: 2,
          episodes: [
            { episodeNumber: 1, title: 'Ep 1' },
            { episodeNumber: 2, title: 'Ep 2' },
          ],
        },
      ],
    })

    const download = await DbDownloads.create({
      media_id: media.id,
      source_id: 'test_tv_hash',
      download_url: 'magnet:tv',
      status: 'completed',
    })

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/tv/Show/S01E01.mkv',
      size: 1_000_000_000,
      episode_id: episodes[0].id,
    })

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/tv/Show/S01E02.mkv',
      size: 1_000_000_000,
      episode_id: episodes[1].id,
    })

    const count = await DbMediaFiles.countByMedia(media.id, episodes[0].id)

    expect(count).toBe(1)
  })

  test('cascade delete does not affect other media files', async () => {
    const { media: media1 } = await seedMedia()

    const media2 = await TestSeed.library.breakingBad()

    const dl1 = await DbDownloads.create({
      media_id: media1.id,
      source_id: 'hash1',
      download_url: 'magnet:1',
      status: 'completed',
    })

    const dl2 = await DbDownloads.create({
      media_id: media2.id,
      source_id: 'hash2',
      download_url: 'magnet:2',
      status: 'completed',
    })

    await DbMediaFiles.create({
      media_id: media1.id,
      download_id: dl1.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })

    await DbMediaFiles.create({
      media_id: media2.id,
      download_id: dl2.id,
      path: '/tv/Breaking Bad (2008)/S01E01.mkv',
      size: 1_500_000_000,
    })

    await DbMedia.delete(media1.id)

    const remaining = await db.selectFrom('media_files').selectAll().execute()

    expect(remaining).toHaveLength(1)
    expect(remaining[0].path).toBe('/tv/Breaking Bad (2008)/S01E01.mkv')
  })
})

describe('getWithScanData', () => {
  test('returns file with empty tracks, zero keyframes, no vad', async () => {
    const { media, download } = await seedMedia()

    const file = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
      format_name: 'matroska,webm',
      duration: 8160.5,
    })

    const results = await DbMediaFiles.getWithScanData(media.id)

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(file.id)
    expect(results[0].media_id).toBe(media.id)
    expect(results[0].download_id).toBe(download.id)
    expect(results[0].path).toBe(
      '/movies/The Matrix (1999)/The.Matrix.1999.mkv'
    )
    expect(results[0].size).toBe(8_000_000_000)
    expect(results[0].format_name).toBe('matroska,webm')
    expect(results[0].duration).toBe(8160.5)
    expect(results[0].keyframes).toBe(0)
    expect(results[0].has_vad).toBe(0)
    expect(results[0].tracks).toEqual([])
  })

  test('includes tracks ordered by stream_index', async () => {
    const { media, download } = await seedMedia()

    const file = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })

    await DbMediaTracks.createMany([
      {
        media_file_id: file.id,
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        channel_layout: '5.1',
      },
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

    const results = await DbMediaFiles.getWithScanData(media.id)

    expect(results[0].tracks).toHaveLength(2)
    expect(results[0].tracks[0].stream_index).toBe(0)
    expect(results[0].tracks[0].stream_type).toBe('video')
    expect(results[0].tracks[0].codec_name).toBe('h264')
    expect(results[0].tracks[1].stream_index).toBe(1)
    expect(results[0].tracks[1].stream_type).toBe('audio')
  })

  test('counts keyframes per file', async () => {
    const { media, download } = await seedMedia()

    const file = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })
    const videoTrack = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
    })

    await DbMediaKeyframes.createBatch([
      { track_id: videoTrack.id, pts_time: 0, duration: 10 },
      { track_id: videoTrack.id, pts_time: 10, duration: 10 },
      { track_id: videoTrack.id, pts_time: 20, duration: 10 },
    ])

    const results = await DbMediaFiles.getWithScanData(media.id)

    expect(results[0].keyframes).toBe(3)
  })

  test('has_vad is true when VAD data exists', async () => {
    const { media, download } = await seedMedia()

    const file = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })
    const audioTrack = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 1,
      stream_type: 'audio',
      codec_name: 'aac',
      is_default: true,
    })

    await DbMediaVad.create({
      track_id: audioTrack.id,
      data: new Uint8Array(Float32Array.from([1, 2, 3, 4]).buffer),
    })

    const results = await DbMediaFiles.getWithScanData(media.id)

    expect(results[0].has_vad).toBe(1)
  })

  test('multiple files ordered by path', async () => {
    const { media, download } = await seedMedia()

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/extras.mkv',
      size: 500_000_000,
    })

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })

    const results = await DbMediaFiles.getWithScanData(media.id)

    expect(results).toHaveLength(2)
    expect(results[0].path).toBe(
      '/movies/The Matrix (1999)/The.Matrix.1999.mkv'
    )
    expect(results[1].path).toBe('/movies/The Matrix (1999)/extras.mkv')
  })

  test('returns empty array for non-existent media', async () => {
    const results = await DbMediaFiles.getWithScanData('NONEXISTENT')

    expect(results).toHaveLength(0)
  })

  test('scan data is scoped to the requested media', async () => {
    const { media: media1, download: dl1 } = await seedMedia()

    const media2 = await TestSeed.library.breakingBad()

    const dl2 = await DbDownloads.create({
      media_id: media2.id,
      source_id: 'hash2',
      download_url: 'magnet:2',
      status: 'completed',
    })

    await DbMediaFiles.create({
      media_id: media1.id,
      download_id: dl1.id,
      path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })

    await DbMediaFiles.create({
      media_id: media2.id,
      download_id: dl2.id,
      path: '/tv/Breaking Bad (2008)/S01E01.mkv',
      size: 1_500_000_000,
    })

    const results = await DbMediaFiles.getWithScanData(media1.id)

    expect(results).toHaveLength(1)
    expect(results[0].media_id).toBe(media1.id)
  })
})
