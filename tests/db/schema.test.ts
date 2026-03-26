import { describe, expect, test, beforeEach } from 'bun:test'

import dayjs from 'dayjs'

import { database, db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/utils'

beforeEach(() => {
  database.reset()
})

describe('schema - tmdb_media', () => {
  test('upsert inserts new record', async () => {
    const result = await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      year: 1999,
      overview: 'A computer hacker learns about the true nature of reality.',
      poster_path: '/poster.jpg',
    })

    expect(result.id).toBeGreaterThan(0)
    expect(result.tmdb_id).toBe(603)
    expect(result.media_type).toBe('movie')
    expect(result.title).toBe('The Matrix')
    expect(result.year).toBe(1999)
    expect(result.overview).toBe(
      'A computer hacker learns about the true nature of reality.'
    )
    expect(result.poster_path).toBe('/poster.jpg')
    expect(result.fetched_at).toBeInstanceOf(Date)
  })

  test('upsert updates existing record on conflict', async () => {
    await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      year: 1999,
    })

    const updated = await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix (Updated)',
      year: 1999,
      overview: 'Updated overview',
    })

    expect(updated.title).toBe('The Matrix (Updated)')
    expect(updated.overview).toBe('Updated overview')

    const all = await db.selectFrom('tmdb_media').selectAll().execute()

    expect(all).toHaveLength(1)
  })

  test('upsert allows different media_type for same tmdb_id', async () => {
    await DbTmdbMedia.upsert({
      tmdb_id: 100,
      media_type: 'movie',
      title: 'Movie Version',
    })

    await DbTmdbMedia.upsert({
      tmdb_id: 100,
      media_type: 'tv',
      title: 'TV Version',
    })

    const all = await db.selectFrom('tmdb_media').selectAll().execute()

    expect(all).toHaveLength(2)
  })

  test('getByTmdbId returns matching record', async () => {
    await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
    })

    const found = await DbTmdbMedia.getByTmdbId(603, 'movie')

    expect(found?.title).toBe('The Matrix')
  })

  test('getByTmdbId returns undefined for non-existent', async () => {
    const found = await DbTmdbMedia.getByTmdbId(999, 'movie')

    expect(found).toBeUndefined()
  })

  test('getById returns matching record', async () => {
    const inserted = await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
    })

    const found = await DbTmdbMedia.getById(inserted.id)

    expect(found?.title).toBe('The Matrix')
  })

  test('nullable fields default to null', async () => {
    const result = await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
    })

    expect(result.year).toBeNull()
    expect(result.overview).toBeNull()
    expect(result.poster_path).toBeNull()
  })
})

describe('schema - media', () => {
  async function seedTmdbMedia() {
    return await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      year: 1999,
    })
  }

  test('create inserts new media record', async () => {
    const tmdb = await seedTmdbMedia()

    const media = await DbMedia.create({
      id: deriveId('603:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/movies',
    })

    expect(media.id).toBe(deriveId('603:movie'))
    expect(media.tmdb_media_id).toBe(tmdb.id)
    expect(media.media_type).toBe('movie')
    expect(media.root_folder).toBe('/movies')
    expect(media.has_file).toBe(false)
    expect(media.added_at).toBeInstanceOf(Date)
  })

  test('has_file defaults to false', async () => {
    const tmdb = await seedTmdbMedia()

    const media = await DbMedia.create({
      id: deriveId('603:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/movies',
    })

    expect(media.has_file).toBe(false)
  })

  test('create with same id upserts and returns existing media', async () => {
    const tmdb = await seedTmdbMedia()

    const first = await DbMedia.create({
      id: deriveId('603:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/movies',
    })

    const second = await DbMedia.create({
      id: deriveId('603:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/movies',
    })

    expect(second.id).toBe(first.id)
  })

  test('getById returns media with title and year from tmdb_media', async () => {
    const tmdb = await seedTmdbMedia()
    const media = await DbMedia.create({
      id: deriveId('603:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/movies',
    })

    const found = await DbMedia.getById(media.id)

    expect(found).toBeDefined()
    expect(found!.title).toBe('The Matrix')
    expect(found!.year).toBe(1999)
    expect(found!.root_folder).toBe('/movies')
  })

  test('getById returns undefined for non-existent', async () => {
    const found = await DbMedia.getById('NONEXISTENT')
    expect(found).toBeUndefined()
  })

  test('list returns all media with title and year', async () => {
    const tmdbMovie = await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      year: 1999,
    })

    const tmdbTv = await DbTmdbMedia.upsert({
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
      year: 2008,
    })

    await DbMedia.create({
      id: deriveId('603:movie'),
      tmdb_media_id: tmdbMovie.id,
      media_type: 'movie',
      root_folder: '/movies',
    })

    await DbMedia.create({
      id: deriveId('1399:tv'),
      tmdb_media_id: tmdbTv.id,
      media_type: 'tv',
      root_folder: '/tv',
    })

    const all = await DbMedia.list()

    expect(all).toHaveLength(2)
    expect(all[0].title).toBeDefined()
    expect(all[1].title).toBeDefined()
  })

  test('list filters by media type', async () => {
    const tmdbMovie = await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      year: 1999,
    })

    const tmdbTv = await DbTmdbMedia.upsert({
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
      year: 2008,
    })

    await DbMedia.create({
      id: deriveId('603:movie'),
      tmdb_media_id: tmdbMovie.id,
      media_type: 'movie',
      root_folder: '/movies',
    })

    await DbMedia.create({
      id: deriveId('1399:tv'),
      tmdb_media_id: tmdbTv.id,
      media_type: 'tv',
      root_folder: '/tv',
    })

    const movies = await DbMedia.list('movie')

    expect(movies).toHaveLength(1)
    expect(movies[0].title).toBe('The Matrix')

    const tv = await DbMedia.list('tv')

    expect(tv).toHaveLength(1)
    expect(tv[0].title).toBe('Breaking Bad')
  })

  test('list returns empty array when no media', async () => {
    const all = await DbMedia.list()

    expect(all).toHaveLength(0)
  })

  test('delete removes media record', async () => {
    const tmdb = await seedTmdbMedia()

    const media = await DbMedia.create({
      id: deriveId('603:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/movies',
    })

    const deleted = await DbMedia.delete(media.id)

    expect(deleted).toBeDefined()
    expect(deleted!.id).toBe(media.id)

    const found = await DbMedia.getById(media.id)

    expect(found).toBeUndefined()
  })

  test('delete returns undefined for non-existent', async () => {
    const deleted = await DbMedia.delete('NONEXISTENT')

    expect(deleted).toBeUndefined()
  })
})

describe('schema - downloads', () => {
  async function seedMediaWithTmdb() {
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

    return { tmdb, media }
  }

  test('create inserts new download', async () => {
    const { media } = await seedMediaWithTmdb()

    const download = await DbDownloads.create({
      media_id: media.id,
      info_hash: 'abc123',
      download_url: 'http://example.com/torrent',
    })

    expect(download.id).toBeGreaterThan(0)
    expect(download.media_id).toBe(media.id)
    expect(download.info_hash).toBe('abc123')
    expect(download.download_url).toBe('http://example.com/torrent')
    expect(download.progress).toBe(0)
    expect(download.speed).toBe(0)
    expect(download.eta).toBe(0)
    expect(download.status).toBe('downloading')
    expect(download.started_at).toBeInstanceOf(Date)
  })

  test('getByMediaId returns download for media', async () => {
    const { media } = await seedMediaWithTmdb()

    await DbDownloads.create({
      media_id: media.id,
      info_hash: 'abc123',
      download_url: 'http://example.com/torrent',
    })

    const found = await DbDownloads.getByMediaId(media.id)

    expect(found).toBeDefined()

    expect(found!.info_hash).toBe('abc123')
  })

  test('getByMediaId returns undefined when no download', async () => {
    const found = await DbDownloads.getByMediaId('NONEXISTENT')

    expect(found).toBeUndefined()
  })

  test('listActive excludes stale completed downloads', async () => {
    const { media } = await seedMediaWithTmdb()

    await DbDownloads.create({
      media_id: media.id,
      info_hash: 'active1',
      download_url: 'http://example.com/1',
    })

    const tmdb2 = await DbTmdbMedia.upsert({
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
      year: 2008,
    })

    const media2 = await DbMedia.create({
      id: deriveId('1399:tv'),
      tmdb_media_id: tmdb2.id,
      media_type: 'tv',
      root_folder: '/tv',
    })

    const completed = await DbDownloads.create({
      media_id: media2.id,
      info_hash: 'completed1',
      download_url: 'http://example.com/2',
    })

    await DbDownloads.update(completed.id, {
      status: 'completed',
      started_at: dayjs().subtract(2, 'day').toDate(),
    })

    const active = await DbDownloads.listActive()

    expect(active).toHaveLength(1)
    expect(active[0].info_hash).toBe('active1')
  })

  test('listActive includes seeding and paused', async () => {
    const { media } = await seedMediaWithTmdb()

    const dl1 = await DbDownloads.create({
      media_id: media.id,
      info_hash: 'seeding1',
      download_url: 'http://example.com/1',
    })

    await DbDownloads.update(dl1.id, { status: 'seeding' })

    const tmdb2 = await DbTmdbMedia.upsert({
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
    })

    const media2 = await DbMedia.create({
      id: deriveId('1399:tv'),
      tmdb_media_id: tmdb2.id,
      media_type: 'tv',
      root_folder: '/tv',
    })

    const dl2 = await DbDownloads.create({
      media_id: media2.id,
      info_hash: 'paused1',
      download_url: 'http://example.com/2',
    })

    await DbDownloads.update(dl2.id, { status: 'paused' })

    const active = await DbDownloads.listActive()

    expect(active).toHaveLength(2)
  })

  test('listActive includes recent error downloads', async () => {
    const { media } = await seedMediaWithTmdb()

    const download = await DbDownloads.create({
      media_id: media.id,
      info_hash: 'error1',
      download_url: 'http://example.com/1',
    })

    await DbDownloads.update(download.id, { status: 'error' })

    const active = await DbDownloads.listActive()

    expect(active).toHaveLength(1)
    expect(active[0].info_hash).toBe('error1')
  })

  test('update modifies download fields', async () => {
    const { media } = await seedMediaWithTmdb()

    const download = await DbDownloads.create({
      media_id: media.id,
      info_hash: 'abc123',
      download_url: 'http://example.com/torrent',
    })

    const updated = await DbDownloads.update(download.id, {
      progress: 0.5,
      speed: 1024000,
      eta: 3600,
      status: 'seeding',
    })

    expect(updated!.progress).toBe(0.5)
    expect(updated!.speed).toBe(1024000)
    expect(updated!.eta).toBe(3600)
    expect(updated!.status).toBe('seeding')
  })

  test('update returns undefined for non-existent', async () => {
    const updated = await DbDownloads.update(999, { progress: 0.5 })

    expect(updated).toBeUndefined()
  })

  test('deleteByMediaId removes downloads for media', async () => {
    const { media } = await seedMediaWithTmdb()

    await DbDownloads.create({
      media_id: media.id,
      info_hash: 'abc123',
      download_url: 'http://example.com/torrent',
    })

    await DbDownloads.deleteByMediaId(media.id)

    const found = await DbDownloads.getByMediaId(media.id)

    expect(found).toBeUndefined()
  })

  test('cascade delete: removing media removes its downloads', async () => {
    const { media } = await seedMediaWithTmdb()

    await DbDownloads.create({
      media_id: media.id,
      info_hash: 'abc123',
      download_url: 'http://example.com/torrent',
    })

    await DbMedia.delete(media.id)

    const allDownloads = await db.selectFrom('downloads').selectAll().execute()

    expect(allDownloads).toHaveLength(0)
  })

  test('cascade delete does not affect other media downloads', async () => {
    const { media } = await seedMediaWithTmdb()

    const tmdb2 = await DbTmdbMedia.upsert({
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
    })

    const media2 = await DbMedia.create({
      id: deriveId('1399:tv'),
      tmdb_media_id: tmdb2.id,
      media_type: 'tv',
      root_folder: '/tv',
    })

    await DbDownloads.create({
      media_id: media.id,
      info_hash: 'hash1',
      download_url: 'http://example.com/1',
    })

    await DbDownloads.create({
      media_id: media2.id,
      info_hash: 'hash2',
      download_url: 'http://example.com/2',
    })

    await DbMedia.delete(media.id)

    const remaining = await db.selectFrom('downloads').selectAll().execute()

    expect(remaining).toHaveLength(1)
    expect(remaining[0].info_hash).toBe('hash2')
  })
})
