import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import { SubtitlesCommand } from '@/commands/subtitles'
import { db } from '@/db/connection'
import { deriveId } from '@/lib/utils'

import '../helpers/api-server'
import { TestSeed } from '../helpers/seed'
import { SubdlMock } from '../mocks/subdl'

beforeEach(async () => {
  TestSeed.reset()
  SubdlMock.reset()
  await SubdlMock.helpers.seed()
})

describe('subtitles command', () => {
  test('returns subtitles for movie', async () => {
    const media = await TestSeed.library.matrix()

    const result = await testCommand(SubtitlesCommand, {
      args: [media.id],
      flags: { json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(2)
    expect(data[0].id).toHaveLength(6)
  })

  test('caches results in releases table', async () => {
    const media = await TestSeed.library.matrix()

    await testCommand(SubtitlesCommand, {
      args: [media.id],
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
    const media = await TestSeed.library.matrix()

    const result = await testCommand(SubtitlesCommand, {
      args: [media.id],
      flags: { json: true, lang: 'FR' },
    })

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(1)
    expect(data[0].name).toContain('FR')
  })

  test('TV requires --season and --episode', async () => {
    const tv = await TestSeed.library.breakingBad()

    const result = await testCommand(SubtitlesCommand, {
      args: [tv.id],
      flags: { json: true },
    })

    expect(result.exitCode).not.toBe(0)
  })

  test('TV search with --season and --episode', async () => {
    const tv = await TestSeed.library.breakingBad()

    const result = await testCommand(SubtitlesCommand, {
      args: [tv.id],
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
        derived_id: deriveId('999:movie'),
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
    const media = await TestSeed.library.matrix()

    const result = await testCommand(SubtitlesCommand, {
      args: [media.id],
      flags: { json: true, auto: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data.media_id).toBe(media.id)
  })

  test('errors for unknown media', async () => {
    const result = await testCommand(SubtitlesCommand, {
      args: ['XXXXXX'],
      flags: { json: true, auto: true },
    })

    expect(result.exitCode).not.toBe(0)
  })
})
