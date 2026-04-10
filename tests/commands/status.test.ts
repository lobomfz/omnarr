import { beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'

import { testCommand } from '@bunli/test'

import '../helpers/api-server'
import { StatusCommand } from '@/commands/status'
import { TorrentSync } from '@/core/torrent-sync'
import { database, db } from '@/db/connection'
import { envVariables } from '@/lib/env'
import { deriveId } from '@/lib/utils'

import '../mocks/qbittorrent'
import { TestSeed } from '../helpers/seed'
import { QBittorrentMock } from '../mocks/qbittorrent'

const MOVIE_ID = deriveId('603:movie')
const TV_ID = deriveId('1399:tv')
const MOVIE_SOURCE_ID = 'ABC123'
const TV_EP_SOURCE_ID = 'BB_HASH_S01E01'
const TV_PACK_SOURCE_ID = 'BB_HASH_S01'
const MOVIE_DL_URL = 'https://beyond-hd.me/dl/abc123'
const TV_EP_DL_URL = 'https://beyond-hd.me/dl/bb_s01e01'
const TV_PACK_DL_URL = 'https://beyond-hd.me/dl/bb_s01'

async function setupMovieDownload() {
  await TestSeed.library.matrix()

  await db
    .insertInto('releases')
    .values({
      id: deriveId(MOVIE_SOURCE_ID),
      tmdb_id: 603,
      media_type: 'movie',
      source_id: MOVIE_SOURCE_ID,
      indexer_source: 'beyond-hd',
      name: 'The.Matrix.1999.2160p.UHD.BluRay.x265-GROUP',
      size: 50_000_000_000,
      hdr: ['DV', 'HDR10'],
      download_url: MOVIE_DL_URL,
    })
    .execute()

  await TestSeed.downloads.torrent({
    mediaId: MOVIE_ID,
    sourceId: MOVIE_SOURCE_ID,
    downloadUrl: MOVIE_DL_URL,
  })
}

async function setupTvDownload() {
  await TestSeed.library.breakingBad({ withEpisodes: false })

  await db
    .insertInto('releases')
    .values([
      {
        id: deriveId(TV_EP_SOURCE_ID),
        tmdb_id: 1399,
        media_type: 'tv',
        source_id: TV_EP_SOURCE_ID,
        indexer_source: 'beyond-hd',
        name: 'Breaking.Bad.S01E01.720p.BluRay.x264-GROUP',
        size: 1_000_000_000,
        hdr: [],
        download_url: TV_EP_DL_URL,
        season_number: 1,
        episode_number: 1,
      },
      {
        id: deriveId(TV_PACK_SOURCE_ID),
        tmdb_id: 1399,
        media_type: 'tv',
        source_id: TV_PACK_SOURCE_ID,
        indexer_source: 'beyond-hd',
        name: 'Breaking.Bad.S01.COMPLETE.1080p.BluRay.x265-OTHER',
        size: 30_000_000_000,
        hdr: [],
        download_url: TV_PACK_DL_URL,
        season_number: 1,
      },
    ])
    .execute()
}

async function insertTvEpisodeDownload() {
  await TestSeed.downloads.torrent({
    mediaId: TV_ID,
    sourceId: TV_EP_SOURCE_ID,
    downloadUrl: TV_EP_DL_URL,
    seasonNumber: 1,
    episodeNumber: 1,
  })
}

async function insertTvSeasonPackDownload() {
  await TestSeed.downloads.torrent({
    mediaId: TV_ID,
    sourceId: TV_PACK_SOURCE_ID,
    downloadUrl: TV_PACK_DL_URL,
    seasonNumber: 1,
  })
}

describe('status command', () => {
  beforeEach(() => {
    TestSeed.reset()
  })

  test('syncs progress from qbittorrent', async () => {
    await setupMovieDownload()

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

    await new TorrentSync().sync()

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
    await setupMovieDownload()

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

    await new TorrentSync().sync()

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

    const result = await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)
    expect(rows).toHaveLength(1)
    expect(rows[0].Status).toBe('error')
  })

  test('recovers download status when torrent reappears in qbittorrent', async () => {
    await setupMovieDownload()

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

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
        url: MOVIE_DL_URL,
        savepath: '/downloads/The Matrix (1999)',
        category: 'omnarr',
        progress: 1,
        dlspeed: 0,
        eta: 0,
        state: 'stalledUP',
        content_path: '/downloads/The Matrix (1999)/abc123',
      })
      .execute()

    await new TorrentSync().sync()

    const recoveredResult = await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    const recoveredRows = JSON.parse(recoveredResult.stdout)
    expect(recoveredRows).toHaveLength(1)
    expect(recoveredRows[0].Status).toBe('completed')
  })

  test('syncs content_path from qbittorrent', async () => {
    await setupMovieDownload()

    const contentPath = '/downloads/The.Matrix.1999.1080p'

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ content_path: contentPath })
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

    const download = await database.kysely
      .selectFrom('downloads')
      .select('content_path')
      .executeTakeFirstOrThrow()

    expect(download.content_path).toBe(contentPath)
  })

  test('logs entered error only on first transition to error', async () => {
    await setupMovieDownload()

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await rm(envVariables.OMNARR_LOG_PATH, { force: true })

    await new TorrentSync().sync()

    const afterFirst = await Bun.file(envVariables.OMNARR_LOG_PATH).text()
    const firstCount = afterFirst
      .split('\n')
      .filter((l) => l.includes('download entered error status')).length

    expect(firstCount).toBe(1)

    await rm(envVariables.OMNARR_LOG_PATH, { force: true })

    await new TorrentSync().sync()

    const afterSecond = await Bun.file(envVariables.OMNARR_LOG_PATH).text()
    const secondCount = afterSecond
      .split('\n')
      .filter((l) => l.includes('download entered error status')).length

    expect(secondCount).toBe(0)
  })

  test('does not log exited error while download remains in error', async () => {
    await setupMovieDownload()

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

    await rm(envVariables.OMNARR_LOG_PATH, { force: true })

    await new TorrentSync().sync()

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

  test('shows S/E context for TV episode download', async () => {
    await setupTvDownload()
    await insertTvEpisodeDownload()

    await new TorrentSync().sync()

    const result = await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)

    expect(rows).toHaveLength(1)
    expect(rows[0].Title).toContain('Breaking Bad (2008) - S01E01')
  })

  test('shows season-only for TV season pack download', async () => {
    await setupTvDownload()
    await insertTvSeasonPackDownload()

    await new TorrentSync().sync()

    const result = await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)

    expect(rows).toHaveLength(1)
    expect(rows[0].Title).toContain('Breaking Bad (2008) - S01')
    expect(rows[0].Title).not.toContain('S01E')
  })

  test('shows no S/E for movie download', async () => {
    await setupMovieDownload()

    await new TorrentSync().sync()

    const result = await testCommand(StatusCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)

    expect(rows).toHaveLength(1)
    expect(rows[0].Title).toBe('The Matrix (1999) [beyond-hd]')
  })
})
