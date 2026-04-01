import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'
import { join } from 'path'

import { testCommand } from '@bunli/test'

import { DownloadCommand } from '@/commands/download'
import { config } from '@/config'
import { database, db } from '@/db/connection'
import { envVariables } from '@/env'
import { Releases } from '@/releases'
import { deriveId } from '@/utils'

import '../mocks/subdl'
import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/superflix'
import '../mocks/yts'
import '../mocks/qbittorrent'

const tracksDir = config.root_folders!.tracks!
const mediaId = deriveId('603:movie')

describe('subtitle download', () => {
  beforeEach(async () => {
    database.reset('media_keyframes')
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    database.reset('releases')
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
})
