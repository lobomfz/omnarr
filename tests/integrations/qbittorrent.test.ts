import { beforeEach, describe, expect, test } from 'bun:test'

import { QBittorrentClient } from '@/integrations/qbittorrent/client'

import '../mocks/qbittorrent'
import { QBittorrentMock } from '../mocks/qbittorrent'

const qbt = new QBittorrentClient({
  url: 'http://localhost:19005',
  username: 'admin',
  password: 'admin',
  category: 'omnarr',
})

beforeEach(() => {
  QBittorrentMock.reset()
})

describe('QBittorrentClient', () => {
  test('addTorrent stores torrent with category', async () => {
    await qbt.addTorrent({
      url: 'magnet:?xt=urn:btih:abc123&dn=Test',
    })

    const rows = await QBittorrentMock.db
      .selectFrom('torrents')
      .selectAll()
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].hash).toBe('abc123')
    expect(rows[0].category).toBe('omnarr')
  })

  test('login fails with wrong credentials', () => {
    const bad = new QBittorrentClient({
      url: 'http://localhost:19005',
      username: 'wrong',
      password: 'wrong',
      category: 'omnarr',
    })

    expect(() => bad.getTorrentStatuses()).toThrow(
      'Download client is unreachable'
    )
  })

  test('getTorrentStatuses maps qBit states to domain status', async () => {
    await QBittorrentMock.db
      .insertInto('torrents')
      .values([
        {
          hash: 'aaa',
          url: '',
          savepath: '',
          category: 'omnarr',
          progress: 0.5,
          dlspeed: 1000,
          eta: 600,
          state: 'stalledDL',
          content_path: '/dl/aaa',
        },
        {
          hash: 'bbb',
          url: '',
          savepath: '',
          category: 'omnarr',
          progress: 1,
          dlspeed: 500,
          eta: 0,
          state: 'uploading',
          content_path: '/dl/bbb',
        },
        {
          hash: 'ccc',
          url: '',
          savepath: '',
          category: 'omnarr',
          progress: 0.3,
          dlspeed: 0,
          eta: 0,
          state: 'pausedDL',
          content_path: '/dl/ccc',
        },
        {
          hash: 'ddd',
          url: '',
          savepath: '',
          category: 'omnarr',
          progress: 0,
          dlspeed: 0,
          eta: 0,
          state: 'missingFiles',
          content_path: '/dl/ddd',
        },
      ])
      .execute()

    const statuses = await qbt.getTorrentStatuses()

    expect(statuses).toHaveLength(4)
    expect(statuses[0]).toEqual({
      hash: 'aaa',
      progress: 0.5,
      speed: 1000,
      eta: 600,
      status: 'downloading',
      content_path: '/dl/aaa',
    })
    expect(statuses[1]).toEqual({
      hash: 'bbb',
      progress: 1,
      speed: 500,
      eta: 0,
      status: 'seeding',
      content_path: '/dl/bbb',
    })
    expect(statuses[2]).toEqual({
      hash: 'ccc',
      progress: 0.3,
      speed: 0,
      eta: 0,
      status: 'paused',
      content_path: '/dl/ccc',
    })
    expect(statuses[3]).toEqual({
      hash: 'ddd',
      progress: 0,
      speed: 0,
      eta: 0,
      status: 'error',
      content_path: '/dl/ddd',
    })
  })

  test('getTorrentStatuses normalizes hash to lowercase', async () => {
    await QBittorrentMock.db
      .insertInto('torrents')
      .values({
        hash: 'ABC123',
        url: '',
        savepath: '',
        category: 'omnarr',
        progress: 0,
        dlspeed: 0,
        eta: 0,
        state: 'downloading',
        content_path: '',
      })
      .execute()

    const statuses = await qbt.getTorrentStatuses()

    expect(statuses[0].hash).toBe('abc123')
  })

  test('addTorrent throws when qBittorrent rejects torrent', async () => {
    await QBittorrentMock.db
      .insertInto('torrents')
      .values({
        hash: 'abc123',
        url: 'magnet:?xt=urn:btih:abc123',
        savepath: '',
        category: 'omnarr',
        progress: 1,
        dlspeed: 0,
        eta: 0,
        state: 'stalledUP',
        content_path: '/dl/abc123',
      })
      .execute()

    await expect(() =>
      qbt.addTorrent({ url: 'magnet:?xt=urn:btih:abc123&dn=Test' })
    ).toThrow('Torrent rejected by download client')
  })

  test('getTorrentStatuses defaults unknown state to error', async () => {
    await QBittorrentMock.db
      .insertInto('torrents')
      .values({
        hash: 'xxx',
        url: '',
        savepath: '',
        category: 'omnarr',
        progress: 0,
        dlspeed: 0,
        eta: 0,
        state: 'unknownState',
        content_path: '',
      })
      .execute()

    const statuses = await qbt.getTorrentStatuses()

    expect(statuses[0].status).toBe('error')
  })
})
