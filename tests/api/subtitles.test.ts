import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'
import { join } from 'path'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { database, db } from '@/db/connection'
import { config } from '@/lib/config'
import { deriveId } from '@/lib/utils'

import '../mocks/subdl'

const client = createRouterClient(router)
const tracksDir = config.root_folders!.tracks!

beforeEach(() => {
  database.reset('downloads')
  database.reset('releases')
  database.reset('media')
  database.reset('tmdb_media')
})

const MOVIE_ID = deriveId('603:movie')
const TV_ID = deriveId('1399:tv')

async function setupMovie() {
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
      id: MOVIE_ID,
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/tmp/movies',
    })
    .execute()

  return MOVIE_ID
}

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
      id: TV_ID,
      tmdb_media_id: tmdb.id,
      media_type: 'tv',
      root_folder: '/tmp/tv',
    })
    .execute()

  return TV_ID
}

describe('subtitles.search', () => {
  test('returns subtitles for a movie', async () => {
    const mediaId = await setupMovie()

    const result = await client.subtitles.search({ media_id: mediaId })

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].id).toHaveLength(6)
  })

  test('returns subtitles with expected fields', async () => {
    const mediaId = await setupMovie()

    const result = await client.subtitles.search({ media_id: mediaId })

    const sub = result[0]

    expect(typeof sub.name).toBe('string')
    expect(sub.indexer_source).toBe('subdl')
  })

  test('filters by language', async () => {
    const mediaId = await setupMovie()

    const result = await client.subtitles.search({
      media_id: mediaId,
      lang: 'FR',
    })

    expect(result).toHaveLength(1)
    expect(result[0].name).toContain('FR')
  })

  test('errors for unknown media', async () => {
    await expect(() => client.subtitles.search({ media_id: 'XXXXXX' })).toThrow(
      'MEDIA_NOT_FOUND'
    )
  })

  test('TV requires season', async () => {
    const mediaId = await setupTvShow()

    await expect(() => client.subtitles.search({ media_id: mediaId })).toThrow(
      'TV_REQUIRES_SEASON'
    )
  })

  test('TV search with season and episode', async () => {
    const mediaId = await setupTvShow()

    const result = await client.subtitles.search({
      media_id: mediaId,
      season: 1,
      episode: 1,
    })

    expect(result).toHaveLength(1)
    expect(result[0].name).toContain('S01E01')
  })
})

async function setupMovieWithRelease(opts?: { url?: string }) {
  const mediaId = await setupMovie()
  const sourceId = 'SUBDL:100-200'
  const releaseId = deriveId(sourceId)

  await db
    .insertInto('releases')
    .values({
      id: releaseId,
      tmdb_id: 603,
      media_type: 'movie',
      source_id: sourceId,
      indexer_source: 'subdl',
      name: 'The.Matrix.1999.1080p.BluRay-GROUP',
      size: 50000,
      hdr: '',
      download_url: opts?.url ?? 'http://localhost:19007/subtitle/100-200.zip',
      language: 'EN',
    })
    .execute()

  return { mediaId, releaseId }
}

async function setupTvWithSeasonPackRelease() {
  const mediaId = await setupTvShow()
  const sourceId = 'SUBDL:SEASON-PACK'
  const releaseId = deriveId(sourceId)

  await db
    .insertInto('releases')
    .values({
      id: releaseId,
      tmdb_id: 1399,
      media_type: 'tv',
      source_id: sourceId,
      indexer_source: 'subdl',
      name: 'Breaking.Bad.S01.1080p.BluRay',
      size: 150000,
      hdr: '',
      download_url: 'http://localhost:19007/subtitle/season-pack.zip',
      language: 'EN',
      season_number: 1,
    })
    .execute()

  return { mediaId, releaseId }
}

describe('subtitles.download', () => {
  afterAll(async () => {
    await rm(tracksDir, { recursive: true }).catch(() => {})
  })

  beforeEach(async () => {
    await rm(tracksDir, { recursive: true }).catch(() => {})
  })

  test('downloads single subtitle and creates download record', async () => {
    const { releaseId, mediaId } = await setupMovieWithRelease()

    const result = await client.subtitles.download({
      release_id: releaseId,
      media_id: mediaId,
    })

    expect(result.media_id).toBe(mediaId)
    expect(result.download_id).toBeGreaterThan(0)
    expect(result.title).toBe('The Matrix')

    const download = await db
      .selectFrom('downloads as d')
      .where('d.id', '=', result.download_id)
      .selectAll('d')
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('completed')
    expect(download.source).toBe('subtitle')
    expect(download.content_path).toContain('.srt')
    expect(download.progress).toBe(1)
  })

  test('saves .srt file to tracks directory', async () => {
    const { releaseId, mediaId } = await setupMovieWithRelease()

    await client.subtitles.download({
      release_id: releaseId,
      media_id: mediaId,
    })

    const download = await db
      .selectFrom('downloads as d')
      .where('d.media_id', '=', mediaId)
      .where('d.source', '=', 'subtitle')
      .select('d.content_path')
      .executeTakeFirstOrThrow()

    const file = Bun.file(download.content_path!)

    expect(await file.exists()).toBe(true)

    const text = await file.text()

    expect(text).toContain('Test subtitle')
  })

  test('handles season pack with multiple .srt files', async () => {
    const { releaseId, mediaId } = await setupTvWithSeasonPackRelease()

    const result = await client.subtitles.download({
      release_id: releaseId,
      media_id: mediaId,
    })

    expect(result.download_id).toBeGreaterThan(0)

    const download = await db
      .selectFrom('downloads as d')
      .where('d.id', '=', result.download_id)
      .selectAll('d')
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('completed')
    expect(download.content_path).toBe(join(tracksDir, result.media_id))

    const ep1File = Bun.file(
      join(
        tracksDir,
        result.media_id,
        's01e01',
        `sub_en_${deriveId('SUBDL:SEASON-PACK')}.srt`
      )
    )
    const ep2File = Bun.file(
      join(
        tracksDir,
        result.media_id,
        's01e02',
        `sub_en_${deriveId('SUBDL:SEASON-PACK')}.srt`
      )
    )

    expect(await ep1File.exists()).toBe(true)
    expect(await ep2File.exists()).toBe(true)
  })

  test('errors for missing release', async () => {
    await expect(() =>
      client.subtitles.download({ release_id: 'XXXXXX', media_id: 'XXXXXX' })
    ).toThrow()
  })

  test('marks download as error when archive has no .srt', async () => {
    const { releaseId, mediaId } = await setupMovieWithRelease({
      url: 'http://localhost:19007/subtitle/no-srt.zip',
    })

    await expect(() =>
      client.subtitles.download({ release_id: releaseId, media_id: mediaId })
    ).toThrow('NO_SRT_IN_ARCHIVE')

    const download = await db
      .selectFrom('downloads as d')
      .where('d.source', '=', 'subtitle')
      .selectAll('d')
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('error')
    expect(download.error_at).not.toBeNull()
  })
})

describe('subtitles.autoMatch', () => {
  test('enqueues job and returns immediately for movie', async () => {
    const mediaId = await setupMovie()

    const result = await client.subtitles.autoMatch({ media_id: mediaId })

    expect(result.media_id).toBe(mediaId)
  })

  test('errors for unknown media', async () => {
    await expect(() =>
      client.subtitles.autoMatch({ media_id: 'XXXXXX' })
    ).toThrow('MEDIA_NOT_FOUND')
  })

  test('errors when TV is missing season/episode', async () => {
    const mediaId = await setupTvShow()

    await expect(() =>
      client.subtitles.autoMatch({ media_id: mediaId })
    ).toThrow('TV_REQUIRES_SEASON_EPISODE')
  })
})
