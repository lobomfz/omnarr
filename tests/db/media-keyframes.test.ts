import { describe, expect, test, beforeEach } from 'bun:test'

import { db } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbMediaTracks } from '@/db/media-tracks'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

async function seedMediaFile() {
  const media = await TestSeed.library.matrix()
  const { download, file } = await TestSeed.downloads.completedWithFile(
    media.id
  )
  const track = await DbMediaTracks.create({
    media_file_id: file.id,
    stream_index: 0,
    stream_type: 'video',
    codec_name: 'h264',
    is_default: true,
  })

  return { media, download, file, track }
}

describe('schema - media_keyframes', () => {
  test('createBatch inserts multiple keyframes', async () => {
    const { track } = await seedMediaFile()

    await DbMediaKeyframes.createBatch([
      {
        track_id: track.id,
        pts_time: 0.0,
        duration: 6.006,
      },
      {
        track_id: track.id,
        pts_time: 6.006,
        duration: 6.006,
      },
      {
        track_id: track.id,
        pts_time: 12.012,
        duration: 3.0,
      },
    ])

    const segments = await DbMediaKeyframes.getSegmentsByTrackId(track.id)

    expect(segments).toHaveLength(3)
  })

  test('createBatch with empty array does nothing', async () => {
    await DbMediaKeyframes.createBatch([])
  })

  test('getSegmentsByTrackId returns segments ordered by pts_time', async () => {
    const { track } = await seedMediaFile()

    await DbMediaKeyframes.createBatch([
      {
        track_id: track.id,
        pts_time: 12.012,
        duration: 3.0,
      },
      {
        track_id: track.id,
        pts_time: 0.0,
        duration: 6.006,
      },
      {
        track_id: track.id,
        pts_time: 6.006,
        duration: 6.006,
      },
    ])

    const segments = await DbMediaKeyframes.getSegmentsByTrackId(track.id)

    expect(segments).toHaveLength(3)
    expect(segments[0].pts_time).toBe(0.0)
    expect(segments[1].pts_time).toBe(6.006)
    expect(segments[2].pts_time).toBe(12.012)
  })

  test('getSegmentsByTrackId returns empty for non-existent track', async () => {
    const segments = await DbMediaKeyframes.getSegmentsByTrackId(999)

    expect(segments).toHaveLength(0)
  })

  test('different video tracks in the same file keep independent keyframe sets', async () => {
    const { file, track } = await seedMediaFile()
    const otherTrack = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 1,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: false,
    })

    await DbMediaKeyframes.createBatch([
      { track_id: track.id, pts_time: 0.0, duration: 4.0 },
      { track_id: track.id, pts_time: 4.0, duration: 4.0 },
      { track_id: otherTrack.id, pts_time: 1.0, duration: 3.0 },
    ])

    const firstTrackSegments = await DbMediaKeyframes.getSegmentsByTrackId(
      track.id
    )
    const secondTrackSegments = await DbMediaKeyframes.getSegmentsByTrackId(
      otherTrack.id
    )

    expect(firstTrackSegments).toHaveLength(2)
    expect(secondTrackSegments).toHaveLength(1)
    expect(secondTrackSegments[0].pts_time).toBe(1.0)
  })

  test('cascade delete: removing media_file removes its keyframes', async () => {
    const { media, track } = await seedMediaFile()

    await DbMediaKeyframes.createBatch([
      { track_id: track.id, pts_time: 0.0, duration: 6.0 },
      { track_id: track.id, pts_time: 6.0, duration: 4.0 },
    ])

    const before = await DbMediaKeyframes.getSegmentsByTrackId(track.id)

    expect(before).toHaveLength(2)

    await DbMediaFiles.deleteByMediaId(media.id)

    const after = await DbMediaKeyframes.getSegmentsByTrackId(track.id)

    expect(after).toHaveLength(0)
  })

  test('cascade delete: removing media cascades through files to keyframes', async () => {
    const { media, track } = await seedMediaFile()

    await DbMediaKeyframes.createBatch([
      { track_id: track.id, pts_time: 0.0, duration: 1.0 },
    ])

    const before = await DbMediaKeyframes.getSegmentsByTrackId(track.id)

    expect(before).toHaveLength(1)

    await DbMedia.delete(media.id)

    const allKeyframes = await db
      .selectFrom('media_keyframes')
      .selectAll()
      .execute()

    expect(allKeyframes).toHaveLength(0)
  })
})
