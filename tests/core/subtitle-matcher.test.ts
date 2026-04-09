import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'

import { SubtitleMatcher } from '@/core/subtitle-matcher'
import { db } from '@/db/connection'
import { config } from '@/lib/config'

import { TestSeed } from '../helpers/seed'
import { SubdlMock } from '../mocks/subdl'

const tracksDir = config.root_folders!.tracks!

beforeEach(async () => {
  TestSeed.reset()
  SubdlMock.reset()
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

afterAll(async () => {
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

async function seedSubdlEntries(
  entries: {
    id: number
    release_name: string
    url: string
    imdb_id: string
  }[]
) {
  await SubdlMock.db
    .insertInto('subtitles')
    .values(
      entries.map((entry) => ({
        ...entry,
        name: `SUBDL::${entry.release_name}`,
        lang: 'english',
        language: 'EN',
        author: 'testuser',
      }))
    )
    .execute()
}

describe('SubtitleMatcher.rank', () => {
  test('ranks fuzzy match on technical part highest', () => {
    const matcher = new SubtitleMatcher({ id: 'test' })

    const ranked = matcher.rank('Movie.2020.1080p.BluRay-GROUP', [
      { name: 'Movie.2020.720p.WEB-OTHER' },
      { name: 'Movie.2020.1080p.BluRay-XYZ' },
    ])

    expect(ranked[0].name).toBe('Movie.2020.1080p.BluRay-XYZ')
  })

  test('ranks group+source above source only', () => {
    const matcher = new SubtitleMatcher({ id: 'test' })

    const ranked = matcher.rank('Movie.2020.1080p.BluRay-GROUP', [
      { name: 'Something.1080p.BluRay-OTHER' },
      { name: 'Something.1080p.BluRay-GROUP' },
    ])

    expect(ranked[0].name).toBe('Something.1080p.BluRay-GROUP')
  })

  test('returns original order when no reference name', () => {
    const matcher = new SubtitleMatcher({ id: 'test' })
    const subs = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]

    const ranked = matcher.rank(null, subs)

    expect(ranked).toEqual(subs)
  })

  test('preserves original order within same tier', () => {
    const matcher = new SubtitleMatcher({ id: 'test' })

    const ranked = matcher.rank('Movie.2020.1080p.BluRay-GROUP', [
      { name: 'Random.Sub.1' },
      { name: 'Random.Sub.2' },
      { name: 'Random.Sub.3' },
    ])

    expect(ranked[0].name).toBe('Random.Sub.1')
    expect(ranked[1].name).toBe('Random.Sub.2')
    expect(ranked[2].name).toBe('Random.Sub.3')
  })
})

describe('SubtitleMatcher.match', () => {
  test('returns matched subtitle when correlation is high', async () => {
    const mediaId = await TestSeed.subtitleMatch.movieWithVad()

    await seedSubdlEntries([
      {
        id: 100,
        release_name: 'The.Matrix.1999.1080p.BluRay-GROUP',
        url: '/subtitle/good-sync.zip',
        imdb_id: 'tt0133093',
      },
    ])

    const matcher = new SubtitleMatcher({ id: mediaId })
    const result = await matcher.match({})

    expect(result.matched).not.toBeNull()
    expect(result.matched!.status).toBe('matched')
    expect(result.matched!.confidence).not.toBeNull()
  })

  test('continues to next candidate on low correlation', async () => {
    const mediaId = await TestSeed.subtitleMatch.movieWithVad()

    await seedSubdlEntries([
      {
        id: 100,
        release_name: 'The.Matrix.1999.1080p.BluRay-GROUP',
        url: '/subtitle/bad-sync.zip',
        imdb_id: 'tt0133093',
      },
      {
        id: 101,
        release_name: 'The.Matrix.1999.720p.WEB-OTHER',
        url: '/subtitle/good-sync.zip',
        imdb_id: 'tt0133093',
      },
    ])

    const matcher = new SubtitleMatcher({ id: mediaId })
    const result = await matcher.match({})

    expect(result.matched).not.toBeNull()
    expect(result.tested.length).toBeGreaterThanOrEqual(2)
    expect(result.tested[0].status).toBe('no-match')
    expect(result.matched!.status).toBe('matched')
  })

  test('returns null when no candidates match', async () => {
    const mediaId = await TestSeed.subtitleMatch.movieWithVad()

    await seedSubdlEntries([
      {
        id: 100,
        release_name: 'The.Matrix.1999.Sub.1',
        url: '/subtitle/bad-sync.zip',
        imdb_id: 'tt0133093',
      },
      {
        id: 101,
        release_name: 'The.Matrix.1999.Sub.2',
        url: '/subtitle/bad-sync.zip',
        imdb_id: 'tt0133093',
      },
    ])

    const matcher = new SubtitleMatcher({ id: mediaId })
    const result = await matcher.match({})

    expect(result.matched).toBeNull()
    expect(result.tested.length).toBe(2)

    for (const attempt of result.tested) {
      expect(attempt.status).toBe('no-match')
    }
  })

  test('returns empty tested list when no subtitles found', async () => {
    const mediaId = await TestSeed.subtitleMatch.movieWithVad()

    const matcher = new SubtitleMatcher({ id: mediaId })
    const result = await matcher.match({})

    expect(result.matched).toBeNull()
    expect(result.tested).toHaveLength(0)
  })

  test('respects max attempts limit', async () => {
    const mediaId = await TestSeed.subtitleMatch.movieWithVad()

    await seedSubdlEntries(
      Array.from({ length: 8 }, (_, i) => ({
        id: 200 + i,
        release_name: `The.Matrix.1999.Sub.${i}`,
        url: '/subtitle/bad-sync.zip',
        imdb_id: 'tt0133093',
      }))
    )

    const matcher = new SubtitleMatcher({ id: mediaId })
    const result = await matcher.match({})

    expect(result.matched).toBeNull()
    expect(result.tested.length).toBeLessThanOrEqual(5)
  })

  test('creates download records for each attempted subtitle', async () => {
    const mediaId = await TestSeed.subtitleMatch.movieWithVad()

    await seedSubdlEntries([
      {
        id: 100,
        release_name: 'The.Matrix.1999.1080p.BluRay-GROUP',
        url: '/subtitle/bad-sync.zip',
        imdb_id: 'tt0133093',
      },
      {
        id: 101,
        release_name: 'The.Matrix.1999.720p.WEB-OTHER',
        url: '/subtitle/good-sync.zip',
        imdb_id: 'tt0133093',
      },
    ])

    const matcher = new SubtitleMatcher({ id: mediaId })

    await matcher.match({})

    const downloads = await db
      .selectFrom('downloads')
      .where('source', '=', 'subtitle')
      .selectAll()
      .execute()

    expect(downloads.length).toBeGreaterThanOrEqual(2)
  })
})
