import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'
import { join } from 'path'

import { testCommand } from '@bunli/test'

import { DownloadCommand } from '@/commands/download'
import { SubtitlesCommand } from '@/commands/subtitles'
import { config } from '@/lib/config'
import { database, db } from '@/db/connection'
import { envVariables } from '@/lib/env'
import { Releases } from '@/core/releases'
import { deriveId } from '@/lib/utils'

import '../mocks/subdl'
import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/superflix'
import '../mocks/yts'
import '../mocks/qbittorrent'

const tracksDir = config.root_folders!.tracks!
const mediaId = deriveId('603:movie')
const tvMediaId = deriveId('1399:tv')

describe('subtitle download', () => {
  beforeEach(async () => {
    database.reset('episodes')
    database.reset('seasons')
    database.reset('media_keyframes')
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    database.reset('releases')
    database.reset('search_results')
    await rm(tracksDir, { recursive: true }).catch(() => {})
  })

  afterAll(async () => {
    await rm(tracksDir, { recursive: true }).catch(() => {})
  })

  async function setupMovieAndSearch() {
    const tmdb = await db
      .insertInto('tmdb_media')
      .values({
        tmdb_id: 603,
        media_type: 'movie',
        title: 'The Matrix',
        year: 1999,
        imdb_id: 'tt0133093',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('media')
      .values({
        id: mediaId,
        tmdb_media_id: tmdb.id,
        media_type: 'movie',
        root_folder: '/tmp/omnarr-test-movies',
      })
      .execute()

    const results = await new Releases().searchSubtitles(mediaId)

    return results[0].id
  }

  test('downloads subtitle and saves .srt to tracks dir', async () => {
    const releaseId = await setupMovieAndSearch()

    const result = await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: { json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data.title).toBe('The Matrix')

    const download = await db
      .selectFrom('downloads')
      .where('source', '=', 'subtitle')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('completed')
    expect(download.progress).toBe(1)
    expect(download.content_path).toContain('.srt')
  })

  test('creates download entry with source subtitle', async () => {
    const releaseId = await setupMovieAndSearch()

    await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: {},
    })

    const downloads = await db.selectFrom('downloads').selectAll().execute()

    expect(downloads).toHaveLength(1)
    expect(downloads[0].source).toBe('subtitle')
  })

  test('saves file to tracks/<media_id>/', async () => {
    const releaseId = await setupMovieAndSearch()

    await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: {},
    })

    const download = await db
      .selectFrom('downloads')
      .where('source', '=', 'subtitle')
      .select('content_path')
      .$narrowType<{ content_path: string }>()
      .executeTakeFirstOrThrow()

    const expectedDir = join(tracksDir, mediaId)

    expect(download.content_path).toStartWith(expectedDir)
    expect(download.content_path).toEndWith('.srt')
    expect(await Bun.file(download.content_path).exists()).toBe(true)
  })

  test('fails when archive has no .srt file', async () => {
    const tmdb = await db
      .insertInto('tmdb_media')
      .values({
        tmdb_id: 603,
        media_type: 'movie',
        title: 'The Matrix',
        year: 1999,
        imdb_id: 'tt0133093',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('media')
      .values({
        id: mediaId,
        tmdb_media_id: tmdb.id,
        media_type: 'movie',
        root_folder: '/tmp/omnarr-test-movies',
      })
      .execute()

    const releaseSourceId = 'SUBDL:NO-SRT-TEST'

    await db
      .insertInto('releases')
      .values({
        id: deriveId(releaseSourceId),
        tmdb_id: 603,
        media_type: 'movie',
        source_id: releaseSourceId,
        indexer_source: 'subdl',
        name: 'Test No SRT',
        size: 0,
        hdr: '',
        download_url: `${envVariables.SUBDL_DOWNLOAD_URL}/subtitle/no-srt-test.zip`,
        language: 'EN',
      })
      .execute()

    const result = await testCommand(DownloadCommand, {
      args: [deriveId(releaseSourceId)],
      flags: {},
    })

    expect(result.exitCode).not.toBe(0)

    const download = await db
      .selectFrom('downloads')
      .where('source', '=', 'subtitle')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('error')
  })

  test('sets download to error when zip download fails', async () => {
    const tmdb = await db
      .insertInto('tmdb_media')
      .values({
        tmdb_id: 603,
        media_type: 'movie',
        title: 'The Matrix',
        year: 1999,
        imdb_id: 'tt0133093',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('media')
      .values({
        id: mediaId,
        tmdb_media_id: tmdb.id,
        media_type: 'movie',
        root_folder: '/tmp/omnarr-test-movies',
      })
      .execute()

    const releaseSourceId = 'SUBDL:NETWORK-FAIL'

    await db
      .insertInto('releases')
      .values({
        id: deriveId(releaseSourceId),
        tmdb_id: 603,
        media_type: 'movie',
        source_id: releaseSourceId,
        indexer_source: 'subdl',
        name: 'Test Network Fail',
        size: 0,
        hdr: '',
        download_url: 'http://127.0.0.1:1/unreachable.zip',
        language: 'EN',
      })
      .execute()

    const result = await testCommand(DownloadCommand, {
      args: [deriveId(releaseSourceId)],
      flags: {},
    })

    expect(result.exitCode).not.toBe(0)

    const download = await db
      .selectFrom('downloads')
      .where('source', '=', 'subtitle')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('error')
    expect(download.error_at).not.toBeNull()
  })
})

describe('tv season subtitle', () => {
  beforeEach(async () => {
    database.reset('episodes')
    database.reset('seasons')
    database.reset('media_keyframes')
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    database.reset('releases')
    database.reset('search_results')
    await rm(tracksDir, { recursive: true }).catch(() => {})
  })

  afterAll(async () => {
    await rm(tracksDir, { recursive: true }).catch(() => {})
  })

  async function setupTvShow() {
    const tmdb = await db
      .insertInto('tmdb_media')
      .values({
        tmdb_id: 1399,
        media_type: 'tv',
        title: 'Breaking Bad',
        year: 2008,
        imdb_id: 'tt0903747',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('media')
      .values({
        id: tvMediaId,
        tmdb_media_id: tmdb.id,
        media_type: 'tv',
        root_folder: '/tmp/omnarr-test-tv',
      })
      .execute()

    return tmdb
  }

  test('searches subtitles with --season only (no --episode)', async () => {
    await setupTvShow()

    const result = await testCommand(SubtitlesCommand, {
      args: [tvMediaId],
      flags: { season: '1', json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data.length).toBeGreaterThan(0)
  })

  test('season pack extracts all .srt files to episode directories', async () => {
    await setupTvShow()

    const results = await new Releases().searchSubtitles(tvMediaId, {
      season: 1,
    })

    const seasonPack = results.find((r) => r.name.includes('S01.1080p.BluRay'))!

    expect(seasonPack).toBeDefined()

    await testCommand(DownloadCommand, {
      args: [seasonPack.id],
      flags: { json: true },
    })

    const ep1Path = join(tracksDir, tvMediaId, 's01e01')
    const ep2Path = join(tracksDir, tvMediaId, 's01e02')
    const ep3Path = join(tracksDir, tvMediaId, 's01e03')

    const ep1Files = await Array.fromAsync(
      new Bun.Glob('*.srt').scan({ cwd: ep1Path })
    )
    const ep2Files = await Array.fromAsync(
      new Bun.Glob('*.srt').scan({ cwd: ep2Path })
    )
    const ep3Files = await Array.fromAsync(
      new Bun.Glob('*.srt').scan({ cwd: ep3Path })
    )

    expect(ep1Files).toHaveLength(1)
    expect(ep2Files).toHaveLength(1)
    expect(ep3Files).toHaveLength(1)
  })

  test('season pack sets content_path to tracks directory', async () => {
    await setupTvShow()

    const results = await new Releases().searchSubtitles(tvMediaId, {
      season: 1,
    })

    const seasonPack = results.find((r) => r.name.includes('S01.1080p.BluRay'))!

    await testCommand(DownloadCommand, {
      args: [seasonPack.id],
      flags: {},
    })

    const download = await db
      .selectFrom('downloads')
      .where('source', '=', 'subtitle')
      .select('content_path')
      .$narrowType<{ content_path: string }>()
      .executeTakeFirstOrThrow()

    const expectedDir = join(tracksDir, tvMediaId)

    expect(download.content_path).toBe(expectedDir)
  })

  test('season pack skips .srt files without episode pattern', async () => {
    await setupTvShow()

    const results = await new Releases().searchSubtitles(tvMediaId, {
      season: 1,
    })

    const seasonPack = results.find((r) => r.name.includes('S01.1080p.BluRay'))!

    await testCommand(DownloadCommand, {
      args: [seasonPack.id],
      flags: {},
    })

    const allSrtFiles = await Array.fromAsync(
      new Bun.Glob('**/*.srt').scan({ cwd: join(tracksDir, tvMediaId) })
    )

    expect(allSrtFiles).toHaveLength(3)
    expect(allSrtFiles.every((f) => f.includes('s01e'))).toBe(true)
  })
})
