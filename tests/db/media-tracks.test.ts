import { describe, expect, test, beforeEach } from 'bun:test'

import { database, db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/utils'

beforeEach(() => {
  database.reset('media_tracks')
  database.reset('media_files')
  database.reset('downloads')
  database.reset('media')
  database.reset('tmdb_media')
})

async function seedMediaFile() {
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

  const download = await DbDownloads.create({
    media_id: media.id,
    info_hash: 'test_hash',
    download_url: 'magnet:test',
    status: 'completed',
    content_path: '/movies/The Matrix (1999)',
  })

  const file = await DbMediaFiles.create({
    media_id: media.id,
    download_id: download.id,
    path: '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
    size: 8_000_000_000,
  })

  return { tmdb, media, download, file }
}

describe('schema - media_tracks', () => {
  test('create persists a video track and returns the record', async () => {
    const { file } = await seedMediaFile()

    const track = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
      width: 1920,
      height: 1080,
      framerate: 23.976,
      bit_rate: 8_000_000,
    })

    expect(track.id).toBeGreaterThan(0)
    expect(track.media_file_id).toBe(file.id)
    expect(track.stream_index).toBe(0)
    expect(track.stream_type).toBe('video')
    expect(track.codec_name).toBe('h264')
    expect(track.is_default).toBe(true)
    expect(track.width).toBe(1920)
    expect(track.height).toBe(1080)
    expect(track.framerate).toBe(23.976)
    expect(track.bit_rate).toBe(8_000_000)
    expect(track.path).toBeNull()
    expect(track.size).toBeNull()
  })

  test('create persists an audio track with audio-specific fields', async () => {
    const { file } = await seedMediaFile()

    const track = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 1,
      stream_type: 'audio',
      codec_name: 'aac',
      language: 'eng',
      title: 'English 5.1',
      is_default: true,
      channels: 6,
      channel_layout: '5.1',
      sample_rate: 48000,
      bit_rate: 640_000,
    })

    expect(track.stream_type).toBe('audio')
    expect(track.channels).toBe(6)
    expect(track.channel_layout).toBe('5.1')
    expect(track.sample_rate).toBe(48000)
    expect(track.bit_rate).toBe(640_000)
    expect(track.width).toBeNull()
    expect(track.height).toBeNull()
  })

  test('create persists a subtitle track with minimal fields', async () => {
    const { file } = await seedMediaFile()

    const track = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 2,
      stream_type: 'subtitle',
      codec_name: 'subrip',
      language: 'por',
      is_default: false,
    })

    expect(track.stream_type).toBe('subtitle')
    expect(track.codec_name).toBe('subrip')
    expect(track.language).toBe('por')
    expect(track.channels).toBeNull()
    expect(track.width).toBeNull()
  })

  test('type-specific fields accept null correctly', async () => {
    const { file } = await seedMediaFile()

    const track = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
    })

    expect(track.language).toBeNull()
    expect(track.title).toBeNull()
    expect(track.path).toBeNull()
    expect(track.size).toBeNull()
    expect(track.width).toBeNull()
    expect(track.height).toBeNull()
    expect(track.framerate).toBeNull()
    expect(track.bit_rate).toBeNull()
    expect(track.channels).toBeNull()
    expect(track.channel_layout).toBeNull()
    expect(track.sample_rate).toBeNull()
  })

  test('getByMediaFileId returns all tracks of a file', async () => {
    const { file } = await seedMediaFile()

    await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
    })

    await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 1,
      stream_type: 'audio',
      codec_name: 'aac',
      is_default: true,
    })

    await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 2,
      stream_type: 'subtitle',
      codec_name: 'subrip',
      is_default: false,
    })

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)

    expect(tracks).toHaveLength(3)
  })

  test('getByMediaFileId returns empty array when no tracks', async () => {
    const tracks = await DbMediaTracks.getByMediaFileId(999)

    expect(tracks).toHaveLength(0)
  })

  test('getByMediaId returns all tracks of a media across files', async () => {
    const { media, download, file } = await seedMediaFile()

    const file2 = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/extras.mkv',
      size: 500_000_000,
    })

    await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
    })

    await DbMediaTracks.create({
      media_file_id: file2.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'hevc',
      is_default: true,
    })

    const tracks = await DbMediaTracks.getByMediaId(media.id)

    expect(tracks).toHaveLength(2)
  })

  test('getByMediaId returns empty array when no tracks', async () => {
    const tracks = await DbMediaTracks.getByMediaId('NONEXISTENT')

    expect(tracks).toHaveLength(0)
  })

  test('update modifies path and size of a track', async () => {
    const { file } = await seedMediaFile()

    const track = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
    })

    const updated = await DbMediaTracks.update(track.id, {
      path: '/tracks/movie/The Matrix (1999)/video/0-h264-1080p.mkv',
      size: 7_500_000_000,
    })

    expect(updated).toBeDefined()
    expect(updated!.path).toBe(
      '/tracks/movie/The Matrix (1999)/video/0-h264-1080p.mkv'
    )
    expect(updated!.size).toBe(7_500_000_000)
  })

  test('update returns undefined for non-existent track', async () => {
    const updated = await DbMediaTracks.update(999, {
      path: '/some/path.mkv',
      size: 100,
    })

    expect(updated).toBeUndefined()
  })

  test('getUnextracted returns tracks with path null for a media', async () => {
    const { media, file } = await seedMediaFile()

    await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
    })

    const extracted = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 1,
      stream_type: 'audio',
      codec_name: 'aac',
      is_default: true,
    })

    await DbMediaTracks.update(extracted.id, {
      path: '/tracks/movie/The Matrix (1999)/audio/1-aac-5.1.mka',
      size: 400_000_000,
    })

    const unextracted = await DbMediaTracks.getUnextracted(media.id)

    expect(unextracted).toHaveLength(1)
    expect(unextracted[0].stream_index).toBe(0)
  })

  test('getUnextracted returns empty when all tracks are extracted', async () => {
    const { media, file } = await seedMediaFile()

    const track = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
    })

    await DbMediaTracks.update(track.id, {
      path: '/tracks/movie/The Matrix (1999)/video/0-h264-1080p.mkv',
      size: 7_500_000_000,
    })

    const unextracted = await DbMediaTracks.getUnextracted(media.id)

    expect(unextracted).toHaveLength(0)
  })

  test('cascade delete: removing media_file removes its tracks', async () => {
    const { media, file } = await seedMediaFile()

    await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
    })

    await DbMediaFiles.deleteByMediaId(media.id)

    const allTracks = await db.selectFrom('media_tracks').selectAll().execute()

    expect(allTracks).toHaveLength(0)
  })

  test('cascade delete: removing media cascades through files to tracks', async () => {
    const { media, file } = await seedMediaFile()

    await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
    })

    await DbMedia.delete(media.id)

    const allTracks = await db.selectFrom('media_tracks').selectAll().execute()

    expect(allTracks).toHaveLength(0)
  })

  test('cascade delete does not affect other file tracks', async () => {
    const { media, download } = await seedMediaFile()

    const file1 = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/file1.mkv',
      size: 8_000_000_000,
    })

    const file2 = await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The Matrix (1999)/file2.mkv',
      size: 500_000_000,
    })

    await DbMediaTracks.create({
      media_file_id: file1.id,
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: true,
    })

    await DbMediaTracks.create({
      media_file_id: file2.id,
      stream_index: 0,
      stream_type: 'audio',
      codec_name: 'aac',
      is_default: true,
    })

    await db.deleteFrom('media_files').where('id', '=', file1.id).execute()

    const remaining = await db.selectFrom('media_tracks').selectAll().execute()

    expect(remaining).toHaveLength(1)
    expect(remaining[0].media_file_id).toBe(file2.id)
  })
})
