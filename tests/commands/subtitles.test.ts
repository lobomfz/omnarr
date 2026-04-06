import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import { SubtitlesCommand } from '@/commands/subtitles'
import { database, db } from '@/db/connection'
import { deriveId } from '@/lib/utils'

import '../helpers/api-server'
import '../mocks/subdl'

beforeEach(() => {
  database.reset()
})

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
      id: 'MTX001',
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/tmp/movies',
    })
    .execute()

  return 'MTX001'
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
      id: 'BRB001',
      tmdb_media_id: tmdb.id,
      media_type: 'tv',
      root_folder: '/tmp/tv',
    })
    .execute()

  return 'BRB001'
}

describe('subtitles command', () => {
  test('returns subtitles for movie', async () => {
    const mediaId = await setupMovie()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(2)
    expect(data[0].id).toHaveLength(6)
  })

  test('caches results in releases table', async () => {
    const mediaId = await setupMovie()

    await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true },
    })

    const releases = await db
      .selectFrom('releases')
      .where('indexer_source', '=', 'subdl')
      .selectAll()
      .execute()

    expect(releases).toHaveLength(2)
    expect(releases[0].download_url).toContain('/subtitle/')
  })

  test('--lang overrides config languages', async () => {
    const mediaId = await setupMovie()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true, lang: 'FR' },
    })

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(1)
    expect(data[0].name).toContain('FR')
  })

  test('TV requires --season and --episode', async () => {
    const mediaId = await setupTvShow()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true },
    })

    expect(result.exitCode).not.toBe(0)
  })

  test('TV search with --season and --episode', async () => {
    const mediaId = await setupTvShow()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true, season: '1', episode: '1' },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(1)
    expect(data[0].name).toContain('S01E01')
  })

  test('errors for unknown media', async () => {
    const result = await testCommand(SubtitlesCommand, {
      args: ['XXXXXX'],
      flags: { json: true },
    })

    expect(result.exitCode).not.toBe(0)
  })

  test('no releases before search', async () => {
    const releases = await db
      .selectFrom('releases')
      .where('indexer_source', '=', 'subdl')
      .selectAll()
      .execute()

    expect(releases).toHaveLength(0)
  })

  test('errors when media has no IMDB ID', async () => {
    const tmdb = await db
      .insertInto('tmdb_media')
      .values({
        tmdb_id: 999,
        media_type: 'movie',
        title: 'No IMDB Movie',
        year: 2020,
        imdb_id: '',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    await db
      .insertInto('media')
      .values({
        id: deriveId('999:movie'),
        tmdb_media_id: tmdb.id,
        media_type: 'movie',
        root_folder: '/tmp/movies',
      })
      .execute()

    const result = await testCommand(SubtitlesCommand, {
      args: [deriveId('999:movie')],
      flags: { json: true },
    })

    expect(result.exitCode).not.toBe(0)
  })
})

describe('subtitles --auto --json', () => {
  test('enqueues auto-match and returns immediately', async () => {
    const mediaId = await setupMovie()

    const result = await testCommand(SubtitlesCommand, {
      args: [mediaId],
      flags: { json: true, auto: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data.media_id).toBe(mediaId)
  })

  test('errors for unknown media', async () => {
    const result = await testCommand(SubtitlesCommand, {
      args: ['XXXXXX'],
      flags: { json: true, auto: true },
    })

    expect(result.exitCode).not.toBe(0)
  })
})
