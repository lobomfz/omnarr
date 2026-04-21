import { describe, expect, test, beforeEach } from 'bun:test'

import { db } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'

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
    stream_index: 1,
    stream_type: 'audio',
    codec_name: 'aac',
    is_default: true,
  })

  return { media, download, file, track }
}

describe('schema - media_vad', () => {
  test('create and retrieve round-trips Float32Array blob correctly', async () => {
    const { track } = await seedMediaFile()

    const timestamps = new Float32Array([1.5, 3.2, 5.0, 7.8, 10.1, 12.5])
    const data = new Uint8Array(timestamps.buffer)

    await DbMediaVad.create({
      track_id: track.id,
      data,
    })

    const retrieved = await DbMediaVad.getByTrackId(track.id)

    expect(retrieved).toBeDefined()
    expect(retrieved!.track_id).toBe(track.id)

    const recovered = new Float32Array(
      retrieved!.data.buffer,
      retrieved!.data.byteOffset,
      retrieved!.data.byteLength / Float32Array.BYTES_PER_ELEMENT
    )

    expect(recovered).toEqual(timestamps)
  })

  test('getByTrackId returns undefined when no vad data', async () => {
    const result = await DbMediaVad.getByTrackId(999)

    expect(result).toBeUndefined()
  })

  test('unique constraint on track_id prevents duplicates', async () => {
    const { track } = await seedMediaFile()
    const data = new Uint8Array(new Float32Array([1.0, 2.0]).buffer)

    await DbMediaVad.create({ track_id: track.id, data })

     expect(() =>
      DbMediaVad.create({ track_id: track.id, data })
    ).toThrow()
  })

  test('different audio tracks in the same file can each store VAD', async () => {
    const { file, track } = await seedMediaFile()
    const otherTrack = await DbMediaTracks.create({
      media_file_id: file.id,
      stream_index: 2,
      stream_type: 'audio',
      codec_name: 'aac',
      is_default: false,
    })

    await DbMediaVad.create({
      track_id: track.id,
      data: new Uint8Array(new Float32Array([1.0, 2.0]).buffer),
    })
    await DbMediaVad.create({
      track_id: otherTrack.id,
      data: new Uint8Array(new Float32Array([3.0, 4.0]).buffer),
    })

    const rows = await db
      .selectFrom('media_vad')
      .select(['track_id'])
      .orderBy('track_id', 'asc')
      .execute()

    expect(rows.map((row) => row.track_id)).toEqual([track.id, otherTrack.id])
  })

  test('cascade delete: removing media_file removes its vad data', async () => {
    const { media, track } = await seedMediaFile()
    const data = new Uint8Array(new Float32Array([1.0, 2.0]).buffer)

    await DbMediaVad.create({ track_id: track.id, data })

    await DbMediaFiles.deleteByMediaId(media.id)

    const all = await db.selectFrom('media_vad').selectAll().execute()

    expect(all).toHaveLength(0)
  })

  test('cascade delete: removing media cascades through files to vad', async () => {
    const { media, track } = await seedMediaFile()
    const data = new Uint8Array(new Float32Array([1.0, 2.0]).buffer)

    await DbMediaVad.create({ track_id: track.id, data })

    await DbMedia.delete(media.id)

    const all = await db.selectFrom('media_vad').selectAll().execute()

    expect(all).toHaveLength(0)
  })
})
