import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import { DownloadCommand } from '@/commands/download'
import { database } from '@/db/connection'
import { DbReleases } from '@/db/releases'
import { Downloads } from '@/downloads'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Releases } from '@/releases'

import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'
import '../mocks/qbittorrent'
import { QBittorrentMock } from '../mocks/qbittorrent'

describe('download command', async () => {
  const results = await new TmdbClient().search('Matrix')
  const releases = await Releases.search(
    results[0].tmdb_id,
    results[0].media_type
  )
  const releaseId = releases[0].id

  beforeEach(() => {
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    QBittorrentMock.reset()
  })

  test('downloads release by ID', async () => {
    const result = await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: { json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)
    expect(data.title).toBe('The Matrix')
    expect(data.year).toBe(1999)
    expect(data.media.root_folder).toBe('/movies')
  })

  test('stores info_hash from indexer', async () => {
    await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: {},
    })

    const download = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.info_hash).toBe('abc123')
  })

  test('sends torrent to qbittorrent without savepath', async () => {
    await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: {},
    })

    const torrents = await QBittorrentMock.db
      .selectFrom('torrents')
      .selectAll()
      .execute()

    expect(torrents).toHaveLength(1)
    expect(torrents[0].savepath).toBe('')
    expect(torrents[0].category).toBe('omnarr')
  })

  test('second download of same TMDB entry reuses media', async () => {
    await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: {},
    })

    await new Downloads().add({
      tmdb_id: results[0].tmdb_id,
      info_hash: 'second_hash',
      download_url: 'magnet:?xt=urn:btih:second_hash&dn=Matrix2',
      type: results[0].media_type,
    })

    const media = await database.kysely
      .selectFrom('media')
      .selectAll()
      .execute()

    const downloads = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .execute()

    expect(media).toHaveLength(1)
    expect(downloads).toHaveLength(2)
    expect(downloads[0].media_id).toBe(downloads[1].media_id)
  })

  test('caches tmdb media in database', async () => {
    await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: {},
    })

    const tmdb = await database.kysely
      .selectFrom('tmdb_media')
      .selectAll()
      .executeTakeFirst()

    expect(tmdb?.tmdb_id).toBe(603)
    expect(tmdb?.title).toBe('The Matrix')
    expect(tmdb?.media_type).toBe('movie')
  })

  test('rejects download when same info_hash is already active', async () => {
    const release = (await DbReleases.getById(releaseId))!

    await new Downloads().add({
      tmdb_id: release.tmdb_id,
      info_hash: release.info_hash,
      download_url: release.download_url,
      type: release.media_type,
    })

    await expect(() =>
      new Downloads().add({
        tmdb_id: release.tmdb_id,
        info_hash: release.info_hash,
        download_url: release.download_url,
        type: release.media_type,
      })
    ).toThrow()

    const downloads = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .execute()

    expect(downloads).toHaveLength(1)
  })

  test('does not persist download record when qbittorrent rejects', async () => {
    const release = (await DbReleases.getById(releaseId))!

    await QBittorrentMock.db
      .insertInto('torrents')
      .values({
        hash: release.info_hash,
        url: release.download_url,
        savepath: '',
        category: 'omnarr',
        progress: 1,
        dlspeed: 0,
        eta: 0,
        state: 'stalledUP',
        content_path: `/dl/${release.info_hash}`,
      })
      .execute()

    await expect(() =>
      new Downloads().add({
        tmdb_id: release.tmdb_id,
        info_hash: release.info_hash,
        download_url: release.download_url,
        type: release.media_type,
      })
    ).toThrow()

    const downloads = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .execute()

    expect(downloads).toHaveLength(0)
  })

  test('prints confirmation message', async () => {
    const result = await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: {},
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Added: The Matrix (1999)')
  })
})
