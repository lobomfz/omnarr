import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from 'bun:test'

import { testCommand } from '@bunli/test'
import dayjs from 'dayjs'

import { WaitForCommand } from '@/commands/wait-for'
import { database } from '@/db/connection'
import { DbReleases } from '@/db/releases'
import { Downloads } from '@/downloads'
import { TmdbClient } from '@/integrations/tmdb/client'

import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'
import '../mocks/qbittorrent'
import { Releases } from '@/releases'

import { QBittorrentMock } from '../mocks/qbittorrent'

describe('wait-for', async () => {
  const now = dayjs()

  const results = await new TmdbClient().search('Matrix')

  const releases = await Releases.search(
    results[0].tmdb_id,
    results[0].media_type
  )

  const release = (await DbReleases.getById(releases[0].id))!

  const addParams = {
    tmdb_id: release.tmdb_id,
    info_hash: release.info_hash,
    download_url: release.download_url,
    type: release.media_type,
  }

  beforeEach(() => {
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    QBittorrentMock.reset()
  })

  afterEach(() => {
    setSystemTime()
  })

  describe('command', () => {
    beforeEach(async () => {
      await new Downloads().add(addParams)
    })

    test('returns immediately when torrent is already completed', async () => {
      await QBittorrentMock.db
        .updateTable('torrents')
        .set({ progress: 1, dlspeed: 0, eta: 0, state: 'uploading' })
        .where('hash', '=', 'abc123')
        .execute()

      const result = await testCommand(WaitForCommand, {
        args: [release.id],
        flags: {},
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Done: The Matrix (1999)')
    })

    test('returns json when torrent is completed', async () => {
      await QBittorrentMock.db
        .updateTable('torrents')
        .set({ progress: 1, dlspeed: 0, eta: 0, state: 'uploading' })
        .where('hash', '=', 'abc123')
        .execute()

      const result = await testCommand(WaitForCommand, {
        args: [release.id],
        flags: { json: true },
      })

      expect(result.exitCode).toBe(0)
      const data = JSON.parse(result.stdout)
      expect(data.status).toBe('completed')
    })

    test('throws when torrent has error status', async () => {
      await QBittorrentMock.db
        .deleteFrom('torrents')
        .where('hash', '=', 'abc123')
        .execute()

      const result = await testCommand(WaitForCommand, {
        args: [release.id],
        flags: {},
      })

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Download failed')
    })

    test('throws for unknown release ID', async () => {
      const result = await testCommand(WaitForCommand, {
        args: ['NOPE00'],
        flags: {},
      })

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("Release 'NOPE00' not found")
    })
  })

  describe('error cleanup', () => {
    test('keeps error downloads within 24h grace period', async () => {
      await new Downloads().add(addParams)

      await QBittorrentMock.db
        .deleteFrom('torrents')
        .where('hash', '=', 'abc123')
        .execute()

      const dl = new Downloads()

      await dl.list(10)

      setSystemTime(now.add(12, 'hours').toDate())

      await dl.list(10)

      const row = await database.kysely
        .selectFrom('downloads')
        .selectAll()
        .executeTakeFirst()

      expect(row).toBeDefined()
      expect(row!.status).toBe('error')
      expect(row!.error_at).toBeDefined()
    })

    test('deletes error downloads after 24h', async () => {
      await new Downloads().add(addParams)

      await QBittorrentMock.db
        .deleteFrom('torrents')
        .where('hash', '=', 'abc123')
        .execute()

      const dl = new Downloads()

      await dl.list(10)

      setSystemTime(now.add(25, 'hours').toDate())

      await dl.list(10)

      const row = await database.kysely
        .selectFrom('downloads')
        .selectAll()
        .executeTakeFirst()

      expect(row).toBeUndefined()
    })
  })
})
