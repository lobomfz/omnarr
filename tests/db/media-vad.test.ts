import { describe, expect, test, beforeEach } from 'bun:test'

import { database, db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaVad } from '@/db/media-vad'
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

  return { media, download, file }
}

describe('schema - media_vad', () => {
  test('create and retrieve round-trips Float32Array blob correctly', async () => {
    const { file } = await seedMediaFile()

    const timestamps = new Float32Array([1.5, 3.2, 5.0, 7.8, 10.1, 12.5])
    const data = new Uint8Array(timestamps.buffer)

    await DbMediaVad.create({
      media_file_id: file.id,
      data,
    })

    const retrieved = await DbMediaVad.getByMediaFileId(file.id)

    expect(retrieved).toBeDefined()
    expect(retrieved!.media_file_id).toBe(file.id)

    const recovered = new Float32Array(
      retrieved!.data.buffer,
      retrieved!.data.byteOffset,
      retrieved!.data.byteLength / Float32Array.BYTES_PER_ELEMENT
    )

    expect(recovered).toEqual(timestamps)
  })

  test('getByMediaFileId returns undefined when no vad data', async () => {
    const result = await DbMediaVad.getByMediaFileId(999)

    expect(result).toBeUndefined()
  })

  test('unique constraint on media_file_id prevents duplicates', async () => {
    const { file } = await seedMediaFile()
    const data = new Uint8Array(new Float32Array([1.0, 2.0]).buffer)

    await DbMediaVad.create({ media_file_id: file.id, data })

     expect(() =>
      DbMediaVad.create({ media_file_id: file.id, data })
    ).toThrow()
  })

  test('cascade delete: removing media_file removes its vad data', async () => {
    const { media, file } = await seedMediaFile()
    const data = new Uint8Array(new Float32Array([1.0, 2.0]).buffer)

    await DbMediaVad.create({ media_file_id: file.id, data })

    await DbMediaFiles.deleteByMediaId(media.id)

    const all = await db.selectFrom('media_vad').selectAll().execute()

    expect(all).toHaveLength(0)
  })

  test('cascade delete: removing media cascades through files to vad', async () => {
    const { media, file } = await seedMediaFile()
    const data = new Uint8Array(new Float32Array([1.0, 2.0]).buffer)

    await DbMediaVad.create({ media_file_id: file.id, data })

    await DbMedia.delete(media.id)

    const all = await db.selectFrom('media_vad').selectAll().execute()

    expect(all).toHaveLength(0)
  })
})
