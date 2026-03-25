import { beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'

import { testCommand } from '@bunli/test'

import { StatusCommand } from '@/commands/status'
import { database } from '@/db/connection'
import { DbReleases } from '@/db/releases'
import { Downloads } from '@/downloads'
import { envVariables } from '@/env'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Releases } from '@/releases'

import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'
import '../mocks/qbittorrent'
import { QBittorrentMock } from '../mocks/qbittorrent'

describe('status command', async () => {
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
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    QBittorrentMock.reset()
  })

  test('syncs progress from qbittorrent', async () => {
    await new Downloads().add(addParams)

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({
        progress: 0.75,
        dlspeed: 5_000_000,
        eta: 600,
        state: 'downloading',
      })
      .where('hash', '=', 'abc123')
      .execute()

    const result = await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)
    expect(rows).toHaveLength(1)
    expect(rows[0].Title).toBe('The Matrix (1999) [beyond-hd]')
    expect(rows[0].Progress).toBe('75.0%')
    expect(rows[0].Speed).toBe('5.0MB/s')
    expect(rows[0].ETA).toBe('10min')
    expect(rows[0].Status).toBe('downloading')
  })

  test('marks download as error when torrent removed from qbittorrent', async () => {
    await new Downloads().add(addParams)

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({
        progress: 0.5,
        dlspeed: 2_000_000,
        eta: 1200,
        state: 'downloading',
      })
      .where('hash', '=', 'abc123')
      .execute()

    await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    const result = await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)
    expect(rows).toHaveLength(1)
    expect(rows[0].Status).toBe('error')
  })

  test('recovers download status when torrent reappears in qbittorrent', async () => {
    await new Downloads().add(addParams)

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    const missingResult = await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    const missingRows = JSON.parse(missingResult.stdout)
    expect(missingRows).toHaveLength(1)
    expect(missingRows[0].Status).toBe('error')

    await QBittorrentMock.db
      .insertInto('torrents')
      .values({
        hash: 'abc123',
        url: addParams.download_url,
        savepath: '/downloads/The Matrix (1999)',
        category: 'omnarr',
        progress: 1,
        dlspeed: 0,
        eta: 0,
        state: 'stalledUP',
        content_path: '/downloads/The Matrix (1999)/abc123',
      })
      .execute()

    const recoveredResult = await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    const recoveredRows = JSON.parse(recoveredResult.stdout)
    expect(recoveredRows).toHaveLength(1)
    expect(recoveredRows[0].Status).toBe('completed')
  })

  test('syncs content_path from qbittorrent', async () => {
    await new Downloads().add(addParams)

    const contentPath = '/downloads/The.Matrix.1999.1080p'

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ content_path: contentPath })
      .where('hash', '=', 'abc123')
      .execute()

    await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    const download = await database.kysely
      .selectFrom('downloads')
      .select('content_path')
      .executeTakeFirstOrThrow()

    expect(download.content_path).toBe(contentPath)
  })

  test('logs entered error only on first transition to error', async () => {
    await new Downloads().add(addParams)

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', release.info_hash)
      .execute()

    await rm(envVariables.OMNARR_LOG_PATH, { force: true })

    await testCommand(StatusCommand, { args: [], flags: { json: true } })

    const afterFirst = await Bun.file(envVariables.OMNARR_LOG_PATH).text()
    const firstCount = afterFirst
      .split('\n')
      .filter((l) => l.includes('download entered error status')).length

    expect(firstCount).toBe(1)

    await rm(envVariables.OMNARR_LOG_PATH, { force: true })

    await testCommand(StatusCommand, { args: [], flags: { json: true } })

    const afterSecond = await Bun.file(envVariables.OMNARR_LOG_PATH).text()
    const secondCount = afterSecond
      .split('\n')
      .filter((l) => l.includes('download entered error status')).length

    expect(secondCount).toBe(0)
  })

  test('does not log exited error while download remains in error', async () => {
    await new Downloads().add(addParams)

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', release.info_hash)
      .execute()

    await testCommand(StatusCommand, { args: [], flags: { json: true } })

    await rm(envVariables.OMNARR_LOG_PATH, { force: true })

    await testCommand(StatusCommand, { args: [], flags: { json: true } })

    const log = await Bun.file(envVariables.OMNARR_LOG_PATH).text()
    const exitedCount = log
      .split('\n')
      .filter((l) => l.includes('download exited error status')).length

    expect(exitedCount).toBe(0)
  })

  test('shows message when no downloads', async () => {
    const result = await testCommand(StatusCommand, {
      args: [],
      flags: {},
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('No downloads.')
  })
})
