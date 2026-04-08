import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import '../helpers/api-server'
import { DownloadCommand } from '@/commands/download'
import { Releases } from '@/core/releases'
import { database } from '@/db/connection'
import { TmdbClient } from '@/integrations/tmdb/client'

import { QBittorrentMock } from '../mocks/qbittorrent'
import '../mocks/beyond-hd'
import '../mocks/superflix'
import '../mocks/yts'
import '../mocks/qbittorrent'
import '../mocks/tmdb'

describe('download command', async () => {
  const results = await new TmdbClient().search('Matrix')
  const releases = await new Releases().search(
    results[0].tmdb_id,
    results[0].media_type
  )
  const torrentRelease = releases.releases.find(
    (r) => r.indexer_source !== 'superflix'
  )!

  beforeEach(() => {
    database.reset('events')
    database.reset('media_files')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    QBittorrentMock.reset()
  })

  test('enqueues download and returns result', async () => {
    const result = await testCommand(DownloadCommand, {
      args: [torrentRelease.id],
      flags: { json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)
    expect(data.title).toBe('The Matrix')
    expect(data.year).toBe(1999)
    expect(data.media_id).toBeDefined()
    expect(data.download_id).toBeDefined()
  })

  test('creates download record via enqueue', async () => {
    await testCommand(DownloadCommand, {
      args: [torrentRelease.id],
      flags: {},
    })

    const download = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.source_id).toBe(torrentRelease.source_id)
  })

  test('sends torrent to qbittorrent', async () => {
    await testCommand(DownloadCommand, {
      args: [torrentRelease.id],
      flags: {},
    })

    const torrents = await QBittorrentMock.db
      .selectFrom('torrents')
      .selectAll()
      .execute()

    expect(torrents).toHaveLength(1)
    expect(torrents[0].category).toBe('omnarr')
  })

  test('caches tmdb media in database', async () => {
    await testCommand(DownloadCommand, {
      args: [torrentRelease.id],
      flags: {},
    })

    const tmdb = await database.kysely
      .selectFrom('tmdb_media')
      .selectAll()
      .executeTakeFirst()

    expect(tmdb?.tmdb_id).toBe(603)
    expect(tmdb?.title).toBe('The Matrix')
    expect(tmdb?.media_type).toBe('movie')
    expect(tmdb?.imdb_id).toBe('tt0133093')
  })

  test('prints enqueue confirmation', async () => {
    const result = await testCommand(DownloadCommand, {
      args: [torrentRelease.id],
      flags: {},
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Enqueued: The Matrix (1999)')
  })
})
