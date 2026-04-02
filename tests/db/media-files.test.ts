import { describe, expect, test, beforeEach } from 'bun:test'

import { database, db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/lib/utils'

beforeEach(() => {
  database.reset()
})

async function seedMedia() {
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

  test('cascade delete does not affect other media files', async () => {
    const { media: media1 } = await seedMedia()

    const tmdb2 = await DbTmdbMedia.upsert({
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
      imdb_id: 'tt0903747',
      year: 2008,
    })

    const media2 = await DbMedia.create({
      id: deriveId('1399:tv'),
      tmdb_media_id: tmdb2.id,
      media_type: 'tv',
      root_folder: '/tv',
    })

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
