import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'
import { join } from 'path'

import { testCommand } from '@bunli/test'

import { DownloadCommand } from '@/commands/download'
import { config } from '@/config'
import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbReleases } from '@/db/releases'
import { Downloads } from '@/downloads'
import type { IndexerName } from '@/integrations/indexers/registry'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Releases } from '@/releases'

import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/superflix'
import '../mocks/yts'
import '../mocks/qbittorrent'
import { QBittorrentMock } from '../mocks/qbittorrent'

describe('download command', async () => {
  const results = await new TmdbClient().search('Matrix')
  const releases = await new Releases().search(
    results[0].tmdb_id,
    results[0].media_type
  )
  const releaseId = releases[0].id

  beforeEach(() => {
    database.reset('media_files')
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
    expect(data.media.root_folder).toBe('/tmp/omnarr-test-movies')
  })

  test('stores source_id from indexer', async () => {
    await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: {},
    })

    const download = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.source_id).toBe('ABC123')
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
      source_id: 'second_hash',
      download_url: 'magnet:?xt=urn:btih:second_hash&dn=Matrix2',
      type: results[0].media_type,
      indexer_source: 'beyond-hd',
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
    expect(tmdb?.imdb_id).toBe('tt0133093')
  })

  test('rejects download when same source_id is already active', async () => {
    const release = (await DbReleases.getById(releaseId))!

    await new Downloads().add({
      tmdb_id: release.tmdb_id,
      source_id: release.source_id,
      download_url: release.download_url,
      type: release.media_type,
      indexer_source: release.indexer_source as IndexerName,
    })

    await expect(() =>
      new Downloads().add({
        tmdb_id: release.tmdb_id,
        source_id: release.source_id,
        download_url: release.download_url,
        type: release.media_type,
        indexer_source: release.indexer_source as IndexerName,
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
        hash: release.source_id.toLowerCase(),
        url: release.download_url,
        savepath: '',
        category: 'omnarr',
        progress: 1,
        dlspeed: 0,
        eta: 0,
        state: 'stalledUP',
        content_path: `/dl/${release.source_id}`,
      })
      .execute()

    await expect(() =>
      new Downloads().add({
        tmdb_id: release.tmdb_id,
        source_id: release.source_id,
        download_url: release.download_url,
        type: release.media_type,
        indexer_source: release.indexer_source as IndexerName,
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

describe('superflix download', async () => {
  const movieDir = config.root_folders!.movie!
  const tracksDir = config.root_folders!.tracks!
  const results = await new TmdbClient().search('Matrix')
  const releases = await new Releases().search(
    results[0].tmdb_id,
    results[0].media_type
  )
  const superflixReleaseId = releases.find(
    (r) => r.indexer_source === 'superflix'
  )!.id

  beforeEach(async () => {
    database.reset('media_keyframes')
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    await rm(movieDir, { recursive: true }).catch(() => {})
    await rm(tracksDir, { recursive: true }).catch(() => {})
  })

  afterAll(async () => {
    await rm(movieDir, { recursive: true }).catch(() => {})
    await rm(tracksDir, { recursive: true }).catch(() => {})
  })

  test('produces individual files per stream', async () => {
    const result = await testCommand(DownloadCommand, {
      args: [superflixReleaseId],
      flags: { json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)
    const mediaId = data.media.id

    expect(data.ripped).toBe(3)
    expect(data.total).toBe(3)

    expect(
      await Bun.file(join(movieDir, 'The Matrix (1999).mkv')).exists()
    ).toBe(true)
    expect(
      await Bun.file(join(tracksDir, mediaId, 'audio_pt.mka')).exists()
    ).toBe(true)
    expect(
      await Bun.file(join(tracksDir, mediaId, 'audio_en.mka')).exists()
    ).toBe(true)
  })

  test('creates download entries per stream with source ripper', async () => {
    await testCommand(DownloadCommand, {
      args: [superflixReleaseId],
      flags: {},
    })

    const downloads = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .execute()

    expect(downloads).toHaveLength(3)

    expect(downloads[0].source).toBe('ripper')
    expect(downloads[0].status).toBe('completed')
    expect(downloads[0].source_id).toBe('SUPERFLIX:TT0133093:VIDEO')

    expect(downloads[1].source_id).toBe('SUPERFLIX:TT0133093:PT')
    expect(downloads[2].source_id).toBe('SUPERFLIX:TT0133093:EN')
  })
})

describe('superflix audio-only download', async () => {
  const tracksDir = config.root_folders!.tracks!
  const results = await new TmdbClient().search('Matrix')
  const releases = await new Releases().search(
    results[0].tmdb_id,
    results[0].media_type
  )
  const superflixReleaseId = releases.find(
    (r) => r.indexer_source === 'superflix'
  )!.id

  beforeEach(async () => {
    database.reset('media_keyframes')
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    await rm(tracksDir, { recursive: true }).catch(() => {})
  })

  afterAll(async () => {
    await rm(tracksDir, { recursive: true }).catch(() => {})
  })

  test('produces .mka files in tracks dir', async () => {
    const result = await testCommand(DownloadCommand, {
      args: [superflixReleaseId],
      flags: { json: true, 'audio-only': true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data.ripped).toBe(2)
    expect(data.total).toBe(2)

    const mediaId = data.media.id

    expect(
      await Bun.file(join(tracksDir, mediaId, 'audio_pt.mka')).exists()
    ).toBe(true)

    expect(
      await Bun.file(join(tracksDir, mediaId, 'audio_en.mka')).exists()
    ).toBe(true)
  })

  test('creates download entries per language', async () => {
    await testCommand(DownloadCommand, {
      args: [superflixReleaseId],
      flags: { 'audio-only': true },
    })

    const downloads = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .execute()

    expect(downloads).toHaveLength(2)

    expect(downloads[0].source).toBe('ripper')
    expect(downloads[0].status).toBe('completed')
    expect(downloads[0].source_id).toBe('SUPERFLIX:TT0133093:PT')

    expect(downloads[1].source_id).toBe('SUPERFLIX:TT0133093:EN')
  })

  test('skips already downloaded streams', async () => {
    await testCommand(DownloadCommand, {
      args: [superflixReleaseId],
      flags: { 'audio-only': true },
    })

    const mediaId = (
      await database.kysely
        .selectFrom('media')
        .select('id')
        .executeTakeFirstOrThrow()
    ).id

    database.reset('media_keyframes')
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('downloads')

    await DbDownloads.create({
      media_id: mediaId,
      source_id: 'SUPERFLIX:TT0133093:PT',
      download_url: '',
      source: 'ripper',
      status: 'completed',
      content_path: '/fake/path.mka',
    })

    const result = await testCommand(DownloadCommand, {
      args: [superflixReleaseId],
      flags: { json: true, 'audio-only': true },
    })

    const data = JSON.parse(result.stdout)

    expect(data.ripped).toBe(1)
    expect(data.total).toBe(2)
  })
})
