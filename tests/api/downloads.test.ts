import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { db } from '@/db/connection'
import { config } from '@/lib/config'

import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'
import '../mocks/superflix'
import '../mocks/qbittorrent'
import { TestSeed } from '../helpers/seed'
import { QBittorrentMock } from '../mocks/qbittorrent'

const client = createRouterClient(router)

const DEAD_PORT_URL = 'http://localhost:19999'
const savedClient = config.download_client
const savedRootFolders = config.root_folders

afterAll(() => {
  config.download_client = savedClient
  config.root_folders = savedRootFolders
})

type SearchedRelease = Awaited<
  ReturnType<typeof TestSeed.releases.matrix>
>['releases'][number]

describe('downloads.add', () => {
  let torrentRelease!: SearchedRelease
  const originalClient = config.download_client
  const originalRootFolders = config.root_folders

  beforeEach(async () => {
    TestSeed.reset()
    config.download_client = originalClient
    config.root_folders = originalRootFolders
    const { releases } = await TestSeed.releases.matrix()
    torrentRelease = releases.find((r) => r.indexer_source !== 'superflix')!
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

  test('throws when release not found', () => {
    expect(() => client.downloads.add({ release_id: 'NONEXISTENT' })).toThrow(
      'RELEASE_NOT_FOUND'
    )
  })

  test('throws when no download client configured', () => {
    config.download_client = undefined

    expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow('NO_DOWNLOAD_CLIENT')
  })

  test('throws when no root folder configured', () => {
    config.root_folders = {}

    expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow('NO_ROOT_FOLDER')
  })

  test('marks download as error when qBittorrent is offline', async () => {
    config.download_client = {
      ...originalClient!,
      url: DEAD_PORT_URL,
    }

    expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow()

    const media = await db.selectFrom('media').selectAll().execute()
    expect(media).toHaveLength(1)

    const downloads = await db.selectFrom('downloads').selectAll().execute()
    expect(downloads).toHaveLength(1)
    expect(downloads[0].status).toBe('error')
    expect(downloads[0].error_at).not.toBeNull()
  })

  test('marks download as error when torrent is rejected', async () => {
    await client.downloads.add({ release_id: torrentRelease.id })

    const [torrent] = await QBittorrentMock.db
      .selectFrom('torrents')
      .selectAll()
      .execute()

    TestSeed.reset()
    await QBittorrentMock.db.insertInto('torrents').values(torrent).execute()
    await TestSeed.releases.matrix()

    expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow()

    const downloads = await db.selectFrom('downloads').selectAll().execute()
    expect(downloads).toHaveLength(1)
    expect(downloads[0].status).toBe('error')
  })

  test('creates error event when download fails', async () => {
    config.download_client = {
      ...originalClient!,
      url: DEAD_PORT_URL,
    }

    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    expect(() =>
      client.downloads.add({
        release_id: torrentRelease.id,
        media_id: media.id,
      })
    ).toThrow()

    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('event_type', '=', 'error')
      .execute()

    expect(events).toHaveLength(1)
    expect(events[0].entity_type).toBe('download')
    expect(events[0].media_id).toBe(media.id)

    const mediaRows = await db.selectFrom('media').selectAll().execute()
    expect(mediaRows).toHaveLength(1)
  })

  test('uses existing media when media_id is provided', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const result = await client.downloads.add({
      release_id: torrentRelease.id,
      media_id: media.id,
    })

    expect(result.media_id).toBe(media.id)
    expect(result.title).toBe('The Matrix')

    const mediaRows = await db.selectFrom('media').selectAll().execute()

    expect(mediaRows).toHaveLength(1)
  })

  test('throws when media_id provided but not found', () => {
    expect(() =>
      client.downloads.add({
        release_id: torrentRelease.id,
        media_id: 'NOTEXIST',
      })
    ).toThrow('MEDIA_NOT_FOUND')
  })

  test('creates download record in error state when qBittorrent fails', async () => {
    config.download_client = {
      ...originalClient!,
      url: DEAD_PORT_URL,
    }

    expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow()

    const downloads = await db.selectFrom('downloads').selectAll().execute()

    expect(downloads).toHaveLength(1)
    expect(downloads[0].status).toBe('error')
  })
})

describe('downloads.add ripper', () => {
  let ripperRelease!: SearchedRelease
  const originalRootFolders = config.root_folders

  beforeEach(async () => {
    TestSeed.reset()
    config.root_folders = originalRootFolders
    const { releases } = await TestSeed.releases.matrix()
    ripperRelease = releases.find((r) => r.indexer_source === 'superflix')!
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

  test('throws when no tracks root folder configured', () => {
    config.root_folders = { movie: '/movies' }

    expect(() =>
      client.downloads.add({ release_id: ripperRelease.id })
    ).toThrow('NO_ROOT_FOLDER')
  })
})

describe('downloads.add TV ripper', () => {
  let tvRipperRelease!: SearchedRelease
  const originalRootFolders = config.root_folders

  beforeEach(async () => {
    TestSeed.reset()
    config.root_folders = originalRootFolders
    const { releases } = await TestSeed.releases.breakingBad()
    tvRipperRelease = releases.find((r) => r.indexer_source === 'superflix')!
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

describe('downloads.add TV torrent', () => {
  let tvTorrentRelease!: SearchedRelease
  const originalClient = config.download_client

  beforeEach(async () => {
    TestSeed.reset()
    config.download_client = originalClient
    const { releases } = await TestSeed.releases.breakingBad()
    tvTorrentRelease = releases.find((r) => r.source_id === 'BB_HASH_S01')!
  })

  test('persists season_number from release onto download record', async () => {
    const result = await client.downloads.add({
      release_id: tvTorrentRelease.id,
    })

    const downloads = await db.selectFrom('downloads').selectAll().execute()

    expect(downloads).toHaveLength(1)
    expect(downloads[0].media_id).toBe(result.media_id)
    expect(downloads[0].season_number).toBe(1)
  })
})

describe('downloads.listInProgress', () => {
  beforeEach(() => {
    TestSeed.reset()
  })

  test('returns empty when no downloads exist', async () => {
    const result = await client.downloads.listInProgress()

    expect(result).toHaveLength(0)
  })

  test('returns active downloads with media info', async () => {
    const media = await TestSeed.library.matrix({
      rootFolder: '/movies',
      posterPath: '/poster.jpg',
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

    const result = await client.downloads.listInProgress()

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('The Matrix')
    expect(result[0].year).toBe(1999)
    expect(result[0].poster_path).toBe('/poster.jpg')
    expect(result[0].status).toBe('downloading')
    expect(result[0].active).toBeTruthy()
    expect(result[0].unread_error_count).toBe(0)
  })

  test('filters by active statuses', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

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

    const result = await client.downloads.listInProgress()

    expect(result).toHaveLength(2)

    const statuses = result.map((d) => d.status)

    expect(statuses).toContain('downloading')
    expect(statuses).toContain('pending')
    expect(statuses).not.toContain('completed')
    expect(statuses).not.toContain('error')

    for (const d of result) {
      expect(d.active).toBeTruthy()
      expect(d.unread_error_count).toBe(0)
    }
  })
})

describe('downloads.add duplicate', () => {
  let torrentRelease!: SearchedRelease
  const originalClient = config.download_client

  beforeEach(async () => {
    TestSeed.reset()
    config.download_client = originalClient
    const { releases } = await TestSeed.releases.matrix()
    torrentRelease = releases.find((r) => r.indexer_source !== 'superflix')!
  })

  test('rejects duplicate download for same source_id', async () => {
    await client.downloads.add({ release_id: torrentRelease.id })

    expect(() =>
      client.downloads.add({ release_id: torrentRelease.id })
    ).toThrow('DUPLICATE_DOWNLOAD')

    const downloads = await db.selectFrom('downloads').selectAll().execute()

    expect(downloads).toHaveLength(1)
  })
})
