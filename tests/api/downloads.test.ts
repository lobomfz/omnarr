import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { Releases } from '@/core/releases'
import { database, db } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { TmdbClient } from '@/integrations/tmdb/client'
import { config } from '@/lib/config'
import { deriveId } from '@/lib/utils'

import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'
import '../mocks/superflix'
import '../mocks/qbittorrent'
import { QBittorrentMock } from '../mocks/qbittorrent'

const client = createRouterClient(router)

const DEAD_PORT_URL = 'http://localhost:19999'
const savedClient = config.download_client
const savedRootFolders = config.root_folders

afterAll(() => {
  config.download_client = savedClient
  config.root_folders = savedRootFolders
})

describe('downloads.add', async () => {
  const results = await new TmdbClient().search('Matrix')
  const releases = await new Releases().search(
    results[0].tmdb_id,
    results[0].media_type
  )
  const torrentRelease = releases.find((r) => r.indexer_source !== 'superflix')!
  const originalClient = config.download_client
  const originalRootFolders = config.root_folders

  beforeEach(() => {
    database.reset('events')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    QBittorrentMock.reset()
    config.download_client = originalClient
    config.root_folders = originalRootFolders
  })

  test('sends torrent to qBittorrent and creates download record', async () => {
    const result = await client.downloads.add({
      release_id: torrentRelease.id,
    })

    expect(result.title).toBe('The Matrix')
    expect(result.year).toBe(1999)
    expect(result.media_id).toBeDefined()
    expect(result.download_id).toBeDefined()

    const downloads = await db.selectFrom('downloads').selectAll().execute()

    expect(downloads).toHaveLength(1)
    expect(downloads[0].media_id).toBe(result.media_id)
  })

  test('creates download.created event on success', async () => {
    const result = await client.downloads.add({
      release_id: torrentRelease.id,
    })

    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('media_id', '=', result.media_id)
      .execute()

    expect(events).toHaveLength(1)
    expect(events[0].entity_type).toBe('download')
    expect(events[0].event_type).toBe('created')
    expect(events[0].message).toContain('The Matrix')
  })

  test('throws when release not found', async () => {
    await expect(() =>
      client.downloads.add({ release_id: 'NONEXISTENT' })
    ).toThrow("Release 'NONEXISTENT' not found")
  })

  test('throws when no download client configured', async () => {
    config.download_client = undefined

    await expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow('No download client configured')
  })

  test('throws when no root folder configured', async () => {
    config.root_folders = {}

    await expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow('No root folder configured for movie')
  })

  test('creates download.error event when qBittorrent is offline', async () => {
    config.download_client = {
      ...originalClient!,
      url: DEAD_PORT_URL,
    }

    await expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow()

    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('event_type', '=', 'error')
      .execute()

    expect(events).toHaveLength(1)
    expect(events[0].entity_type).toBe('download')
  })

  test('creates download.error event when torrent is rejected', async () => {
    await client.downloads.add({ release_id: torrentRelease.id })

    database.reset('events')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')

    await expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow()

    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('event_type', '=', 'error')
      .execute()

    expect(events).toHaveLength(1)
    expect(events[0].entity_type).toBe('download')
  })

  test('uses existing media when media_id is provided', async () => {
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

    const result = await client.downloads.add({
      release_id: torrentRelease.id,
      media_id: media.id,
    })

    expect(result.media_id).toBe(media.id)
    expect(result.title).toBe('The Matrix')

    const mediaRows = await db.selectFrom('media').selectAll().execute()

    expect(mediaRows).toHaveLength(1)
  })

  test('throws when media_id provided but not found', async () => {
    await expect(() =>
      client.downloads.add({
        release_id: torrentRelease.id,
        media_id: 'NOTEXIST',
      })
    ).toThrow("Media 'NOTEXIST' not found")
  })

  test('does not create download record when qBittorrent fails', async () => {
    config.download_client = {
      ...originalClient!,
      url: DEAD_PORT_URL,
    }

    await expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow()

    const downloads = await db.selectFrom('downloads').selectAll().execute()

    expect(downloads).toHaveLength(0)
  })
})

describe('downloads.add ripper', async () => {
  const results = await new TmdbClient().search('Matrix')
  const releases = await new Releases().search(
    results[0].tmdb_id,
    results[0].media_type
  )
  const ripperRelease = releases.find((r) => r.indexer_source === 'superflix')!
  const originalRootFolders = config.root_folders

  beforeEach(() => {
    database.reset('events')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    config.root_folders = originalRootFolders
  })

  test('creates download record with pending status and ripper source', async () => {
    const result = await client.downloads.add({
      release_id: ripperRelease.id,
    })

    expect(result.title).toBe('The Matrix')
    expect(result.media_id).toBeDefined()

    const downloads = await db.selectFrom('downloads').selectAll().execute()

    expect(downloads).toHaveLength(1)
    expect(downloads[0].source).toBe('ripper')
    expect(downloads[0].status).toBe('pending')
  })

  test('creates download.created event', async () => {
    const result = await client.downloads.add({
      release_id: ripperRelease.id,
    })

    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('media_id', '=', result.media_id)
      .execute()

    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('created')
    expect(events[0].message).toContain('The Matrix')
  })

  test('throws when no tracks root folder configured', async () => {
    config.root_folders = { movie: '/movies' }

    await expect(() =>
      client.downloads.add({ release_id: ripperRelease.id })
    ).toThrow('No tracks root folder configured')
  })
})

describe('downloads.add TV ripper', async () => {
  const results = await new TmdbClient().search('Breaking Bad')
  const tvResult = results[0]
  const releases = await new Releases().search(
    tvResult.tmdb_id,
    tvResult.media_type,
    { season: 1 }
  )
  const tvRipperRelease = releases.find(
    (r) => r.indexer_source === 'superflix'
  )!
  const originalRootFolders = config.root_folders

  beforeEach(async () => {
    database.reset('events')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    config.root_folders = originalRootFolders

    await new Releases().search(tvResult.tmdb_id, tvResult.media_type, {
      season: 1,
    })
  })

  test('creates N download records for N episodes', async () => {
    const result = await client.downloads.add({
      release_id: tvRipperRelease.id,
    })

    expect(result.media_id).toBeDefined()

    const downloads = await db.selectFrom('downloads').selectAll().execute()

    expect(downloads).toHaveLength(3)

    const sourceIds = new Set(downloads.map((d) => d.source_id))

    expect(sourceIds.size).toBe(1)

    for (const d of downloads) {
      expect(d.source).toBe('ripper')
      expect(d.status).toBe('pending')
      expect(d.season_number).toBe(1)
      expect(d.episode_number).toBeGreaterThanOrEqual(1)
      expect(d.source_id).not.toMatch(/:S\d+E\d+$/)
    }
  })

  test('creates single download.created event for season', async () => {
    const result = await client.downloads.add({
      release_id: tvRipperRelease.id,
    })

    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('media_id', '=', result.media_id)
      .execute()

    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('created')
    expect(events[0].message).toContain('S01')
    expect(events[0].message).toContain('3 episodes')
  })
})

describe('downloads.listActive', () => {
  beforeEach(() => {
    database.reset('events')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
  })

  test('returns empty when no downloads exist', async () => {
    const result = await client.downloads.listActive()

    expect(result).toHaveLength(0)
  })

  test('returns active downloads with media info', async () => {
    const tmdb = await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      imdb_id: 'tt0133093',
      year: 1999,
      poster_path: '/poster.jpg',
    })

    const media = await DbMedia.create({
      id: deriveId('603:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/movies',
    })

    await db
      .insertInto('downloads')
      .values({
        media_id: media.id,
        source_id: 'hash123',
        download_url: 'magnet:test',
        status: 'downloading',
        progress: 0.5,
        speed: 1_000_000,
        eta: 600,
      })
      .execute()

    const result = await client.downloads.listActive()

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('The Matrix')
    expect(result[0].year).toBe(1999)
    expect(result[0].poster_path).toBe('/poster.jpg')
    expect(result[0].status).toBe('downloading')
  })

  test('filters by active statuses', async () => {
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

    await db
      .insertInto('downloads')
      .values([
        {
          media_id: media.id,
          source_id: 'hash_active',
          download_url: 'magnet:test1',
          status: 'downloading',
        },
        {
          media_id: media.id,
          source_id: 'hash_pending',
          download_url: 'magnet:test2',
          status: 'pending',
        },
        {
          media_id: media.id,
          source_id: 'hash_completed',
          download_url: 'magnet:test3',
          status: 'completed',
        },
        {
          media_id: media.id,
          source_id: 'hash_error',
          download_url: 'magnet:test4',
          status: 'error',
        },
      ])
      .execute()

    const result = await client.downloads.listActive()

    expect(result).toHaveLength(2)

    const statuses = result.map((d) => d.status)

    expect(statuses).toContain('downloading')
    expect(statuses).toContain('pending')
    expect(statuses).not.toContain('completed')
    expect(statuses).not.toContain('error')
  })
})
