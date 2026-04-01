import { describe, expect, test, beforeEach } from 'bun:test'

import { database, db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaEnvelopes } from '@/db/media-envelopes'
import { DbMediaFiles } from '@/db/media-files'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/utils'

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

describe('schema - media_envelopes', () => {
  test('create and retrieve round-trips the blob correctly', async () => {
    const { file } = await seedMediaFile()

    const signed = new Int8Array([-128, -1, 0, 1, 127, 50, -50])
    const data = new Uint8Array(signed.buffer)

    await DbMediaEnvelopes.create({
      media_file_id: file.id,
      sample_rate: 8000,
      window_size: 400,
      data,
    })

    const retrieved = await DbMediaEnvelopes.getByMediaFileId(file.id)

    expect(retrieved).toBeDefined()
    expect(retrieved!.media_file_id).toBe(file.id)
    expect(retrieved!.sample_rate).toBe(8000)
    expect(retrieved!.window_size).toBe(400)

    const recovered = new Int8Array(
      retrieved!.data.buffer,
      retrieved!.data.byteOffset,
      retrieved!.data.byteLength
    )

    expect(recovered).toEqual(signed)
  })

  test('getByMediaFileId returns undefined when no envelope', async () => {
    const result = await DbMediaEnvelopes.getByMediaFileId(999)

    expect(result).toBeUndefined()
  })

  test('unique constraint on media_file_id prevents duplicates', async () => {
    const { file } = await seedMediaFile()
    const data = new Uint8Array([1, 2, 3])

    await DbMediaEnvelopes.create({
      media_file_id: file.id,
      sample_rate: 8000,
      window_size: 400,
      data,
    })

    await expect(() =>
      DbMediaEnvelopes.create({
        media_file_id: file.id,
        sample_rate: 8000,
        window_size: 400,
        data,
      })
    ).toThrow()
  })

  test('cascade delete: removing media_file removes its envelope', async () => {
    const { media, file } = await seedMediaFile()
    const data = new Uint8Array([1, 2, 3])

    await DbMediaEnvelopes.create({
      media_file_id: file.id,
      sample_rate: 8000,
      window_size: 400,
      data,
    })

    await DbMediaFiles.deleteByMediaId(media.id)

    const all = await db.selectFrom('media_envelopes').selectAll().execute()

    expect(all).toHaveLength(0)
  })

  test('cascade delete: removing media cascades through files to envelopes', async () => {
    const { media, file } = await seedMediaFile()
    const data = new Uint8Array([1, 2, 3])

    await DbMediaEnvelopes.create({
      media_file_id: file.id,
      sample_rate: 8000,
      window_size: 400,
      data,
    })

    await DbMedia.delete(media.id)

    const all = await db.selectFrom('media_envelopes').selectAll().execute()

    expect(all).toHaveLength(0)
  })
})
