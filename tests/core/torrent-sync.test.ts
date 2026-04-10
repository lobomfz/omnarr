import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { PubSub } from '@/api/pubsub'
import { TorrentSync } from '@/core/torrent-sync'
import { db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { QBittorrentClient } from '@/integrations/qbittorrent/client'
import { scanQueue } from '@/jobs/queues'
import { config } from '@/lib/config'
import { deriveId } from '@/lib/utils'

import '../mocks/qbittorrent'
import { TestSeed } from '../helpers/seed'
import { QBittorrentMock } from '../mocks/qbittorrent'

const DEAD_PORT_URL = 'http://localhost:19999'
const MEDIA_ID = deriveId('603:movie')
const SOURCE_ID = 'ABC123'
const DOWNLOAD_URL = 'https://beyond-hd.me/dl/abc123'

async function setupDownload() {
  await TestSeed.library.matrix()

  await TestSeed.downloads.torrent({
    mediaId: MEDIA_ID,
    sourceId: SOURCE_ID,
    downloadUrl: DOWNLOAD_URL,
  })
}

describe('TorrentSync', () => {
  const originalUrl = config.download_client!.url

  beforeEach(() => {
    TestSeed.reset()
    config.download_client!.url = originalUrl
  })

  afterEach(() => {
    config.download_client!.url = originalUrl
  })

  test('updates download progress from qBittorrent', async () => {
    await setupDownload()

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ progress: 0.5, dlspeed: 2_000_000, eta: 300 })
      .where('hash', '=', 'abc123')
      .execute()

    const result = await new TorrentSync().sync()

    expect(result.updated).toBeGreaterThan(0)

    const download = await db
      .selectFrom('downloads')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.progress).toBe(0.5)
    expect(download.speed).toBe(2_000_000)
    expect(download.eta).toBe(300)
  })

  test('no-op when no active downloads exist', async () => {
    const result = await new TorrentSync().sync()

    expect(result.updated).toBe(0)
    expect(result.completed).toHaveLength(0)
  })

  test('returns completed media_ids when downloads finish', async () => {
    await setupDownload()

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ progress: 1, dlspeed: 0, eta: 0, state: 'uploading' })
      .where('hash', '=', 'abc123')
      .execute()

    const result = await new TorrentSync().sync()

    expect(result.completed).toHaveLength(1)

    const download = await db
      .selectFrom('downloads')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('completed')
  })

  test('marks download as error when torrent not found in qBittorrent', async () => {
    await setupDownload()

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

    const download = await db
      .selectFrom('downloads')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('error')
    expect(download.error_at).not.toBeNull()
  })

  test('creates sync.error event on first failure', async () => {
    await setupDownload()

    config.download_client!.url = DEAD_PORT_URL

    const sync = new TorrentSync()

    await expect(() => sync.sync()).toThrow()

    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('entity_type', '=', 'sync')
      .execute()

    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('error')
    expect(events[0].entity_id).toBe('torrent-sync')
  })

  test('does not create duplicate events on sustained failure', async () => {
    await setupDownload()

    config.download_client!.url = DEAD_PORT_URL

    const sync = new TorrentSync()

    for (let i = 0; i < 3; i++) {
      await expect(() => sync.sync()).toThrow()
    }

    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('entity_type', '=', 'sync')
      .execute()

    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('error')
  })

  test('publishes download_progress events for active downloads', async () => {
    await setupDownload()

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ progress: 0.5, dlspeed: 2_000_000, eta: 300 })
      .where('hash', '=', 'abc123')
      .execute()

    const events: unknown[] = []
    const controller = new AbortController()

    const collecting = (async () => {
      for await (const event of PubSub.subscribe(
        'download_progress',
        controller.signal
      )) {
        events.push(event)
      }
    })().catch(() => {})

    await new TorrentSync().sync()

    await Bun.sleep(10)
    controller.abort()
    await collecting

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      media_id: MEDIA_ID,
      source_id: SOURCE_ID,
      progress: 0.5,
      speed: 2_000_000,
      eta: 300,
      status: 'downloading',
    })
  })

  test('creates sync.recovered event after reconnection', async () => {
    await setupDownload()

    config.download_client!.url = DEAD_PORT_URL

    const sync = new TorrentSync()

    await expect(() => sync.sync()).toThrow()

    config.download_client!.url = originalUrl

    await sync.sync()

    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('entity_type', '=', 'sync')
      .orderBy('created_at', 'asc')
      .execute()

    expect(events).toHaveLength(2)
    expect(events[0].event_type).toBe('error')
    expect(events[1].event_type).toBe('recovered')
    expect(events[1].message).toBe('Torrent sync reconnected')
  })

  test('does not mark download as error when qBittorrent has not processed the add yet', async () => {
    await TestSeed.library.matrix()

    const qbt = new QBittorrentClient(config.download_client!)

    await qbt.addTorrent({
      url: `magnet:?xt=urn:btih:${SOURCE_ID}`,
      hash: SOURCE_ID,
    })

    await DbDownloads.create({
      media_id: MEDIA_ID,
      source_id: SOURCE_ID,
      download_url: DOWNLOAD_URL,
    })

    await new TorrentSync().sync()

    const download = await db
      .selectFrom('downloads')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('downloading')
    expect(download.error_at).toBeNull()
  })

  test('enqueues scan job when torrent completes', async () => {
    await setupDownload()

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ progress: 1, dlspeed: 0, eta: 0, state: 'uploading' })
      .where('hash', '=', 'abc123')
      .execute()

    const result = await new TorrentSync().sync()

    expect(result.completed).toContain(MEDIA_ID)

    const scanJobs = scanQueue.getJobs()
    const scanForMedia = scanJobs.find((j) => j.data.media_id === MEDIA_ID)

    expect(scanForMedia).toBeDefined()

    scanQueue.clear()
  })
})
