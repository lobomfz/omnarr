import { describe, expect, test, beforeEach } from 'bun:test'

import { database, db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/lib/utils'

beforeEach(() => {
  database.reset()
})

async function seedMediaFile() {
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

  const download = await DbDownloads.create({
    media_id: media.id,
    source_id: 'test_hash',
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

describe('schema - media_keyframes', () => {
  test('createBatch inserts multiple keyframes', async () => {
    const { file } = await seedMediaFile()

    await DbMediaKeyframes.createBatch([
      {
        media_file_id: file.id,
        stream_index: 0,
        pts_time: 0.0,
        duration: 6.006,
      },
      {
        media_file_id: file.id,
        stream_index: 0,
        pts_time: 6.006,
        duration: 6.006,
      },
      {
        media_file_id: file.id,
        stream_index: 0,
        pts_time: 12.012,
        duration: 3.0,
      },
    ])

    const segments = await DbMediaKeyframes.getSegmentsByFileId(file.id)

    expect(segments).toHaveLength(3)
  })

  test('createBatch with empty array does nothing', async () => {
    await DbMediaKeyframes.createBatch([])
  })

  test('getSegmentsByFileId returns segments ordered by pts_time', async () => {
    const { file } = await seedMediaFile()

    await DbMediaKeyframes.createBatch([
      {
        media_file_id: file.id,
        stream_index: 0,
        pts_time: 12.012,
        duration: 3.0,
      },
      {
        media_file_id: file.id,
        stream_index: 0,
        pts_time: 0.0,
        duration: 6.006,
      },
      {
        media_file_id: file.id,
        stream_index: 0,
        pts_time: 6.006,
        duration: 6.006,
      },
    ])

    const segments = await DbMediaKeyframes.getSegmentsByFileId(file.id)

    expect(segments).toHaveLength(3)
    expect(segments[0].pts_time).toBe(0.0)
    expect(segments[1].pts_time).toBe(6.006)
    expect(segments[2].pts_time).toBe(12.012)
  })

  test('getSegmentsByFileId returns empty for non-existent file', async () => {
    const segments = await DbMediaKeyframes.getSegmentsByFileId(999)

    expect(segments).toHaveLength(0)
  })

  test('cascade delete: removing media_file removes its keyframes', async () => {
    const { media, file } = await seedMediaFile()

    await DbMediaKeyframes.createBatch([
      { media_file_id: file.id, stream_index: 0, pts_time: 0.0, duration: 6.0 },
      { media_file_id: file.id, stream_index: 0, pts_time: 6.0, duration: 4.0 },
    ])

    const before = await DbMediaKeyframes.getSegmentsByFileId(file.id)

    expect(before).toHaveLength(2)

    await DbMediaFiles.deleteByMediaId(media.id)

    const after = await DbMediaKeyframes.getSegmentsByFileId(file.id)

    expect(after).toHaveLength(0)
  })

  test('cascade delete: removing media cascades through files to keyframes', async () => {
    const { media, file } = await seedMediaFile()

    await DbMediaKeyframes.createBatch([
      { media_file_id: file.id, stream_index: 0, pts_time: 0.0, duration: 1.0 },
    ])

    const before = await DbMediaKeyframes.getSegmentsByFileId(file.id)

    expect(before).toHaveLength(1)

    await DbMedia.delete(media.id)

    const allKeyframes = await db
      .selectFrom('media_keyframes')
      .selectAll()
      .execute()

    expect(allKeyframes).toHaveLength(0)
  })
})
