import { describe, expect, test } from 'bun:test'

import { SubtitleMatcher } from '@/core/subtitle-matcher'

describe('SubtitleMatcher.rank', () => {
  const matcher = new SubtitleMatcher({ id: 'TEST01' })

  test('fuzzy match ranks above group+source match', () => {
    const reference = 'The.Matrix.1999.1080p.BluRay.x264-GROUP'

    const subtitles = [
      { name: 'The.Matrix.1999.720p.BluRay.DTS-GROUP' },
      { name: 'The.Matrix.1999.1080p.BluRay.x264-GROUP' },
    ]

    const ranked = matcher.rank(reference, subtitles)

    expect(ranked[0].name).toBe('The.Matrix.1999.1080p.BluRay.x264-GROUP')
    expect(ranked[1].name).toBe('The.Matrix.1999.720p.BluRay.DTS-GROUP')
  })

  test('group+source match ranks above source-only match', () => {
    const reference = 'The.Matrix.1999.1080p.BluRay.x264-GROUP'

    const subtitles = [
      { name: 'The.Matrix.1999.720p.BluRay-OTHER' },
      { name: 'The.Matrix.1999.720p.BluRay.x265-GROUP' },
    ]

    const ranked = matcher.rank(reference, subtitles)

    expect(ranked[0].name).toBe('The.Matrix.1999.720p.BluRay.x265-GROUP')
    expect(ranked[1].name).toBe('The.Matrix.1999.720p.BluRay-OTHER')
  })

  test('source-only match ranks above no-match', () => {
    const reference = 'The.Matrix.1999.1080p.BluRay.x264-GROUP'

    const subtitles = [
      { name: 'The.Matrix.1999.HDTV-SOMEONE' },
      { name: 'The.Matrix.1999.BluRay-OTHER' },
    ]

    const ranked = matcher.rank(reference, subtitles)

    expect(ranked[0].name).toBe('The.Matrix.1999.BluRay-OTHER')
    expect(ranked[1].name).toBe('The.Matrix.1999.HDTV-SOMEONE')
  })

  test('full tier ordering: fuzzy > group+source > source > none', () => {
    const reference = 'Movie.2024.1080p.BluRay.x264-SPARKS'

    const subtitles = [
      { name: 'Movie.2024.HDTV-OTHER' },
      { name: 'Movie.2024.1080p.BluRay.x264-SPARKS' },
      { name: 'Movie.2024.720p.BluRay-DEMAND' },
      { name: 'Movie.2024.720p.BluRay.DTS-SPARKS' },
    ]

    const ranked = matcher.rank(reference, subtitles)

    expect(ranked.map((s) => s.name)).toEqual([
      'Movie.2024.1080p.BluRay.x264-SPARKS',
      'Movie.2024.720p.BluRay.DTS-SPARKS',
      'Movie.2024.720p.BluRay-DEMAND',
      'Movie.2024.HDTV-OTHER',
    ])
  })

  test('preserves original order within same tier', () => {
    const reference = 'Movie.2024.1080p.BluRay.x264-GRP'

    const subtitles = [
      { name: 'Movie.2024.720p.BluRay-FIRST' },
      { name: 'Movie.2024.1080p.BluRay-SECOND' },
      { name: 'Movie.2024.BluRay-THIRD' },
    ]

    const ranked = matcher.rank(reference, subtitles)

    expect(ranked.map((s) => s.name)).toEqual([
      'Movie.2024.720p.BluRay-FIRST',
      'Movie.2024.1080p.BluRay-SECOND',
      'Movie.2024.BluRay-THIRD',
    ])
  })

  test('empty subtitle list returns empty', () => {
    const ranked = matcher.rank('Movie.1080p.BluRay-GRP', [])

    expect(ranked).toEqual([])
  })

  test('null reference puts all in no-match tier preserving order', () => {
    const subtitles = [
      { name: 'Movie.BluRay-FIRST' },
      { name: 'Movie.WEBRip-SECOND' },
      { name: 'Movie.HDTV-THIRD' },
    ]

    const ranked = matcher.rank(null, subtitles)

    expect(ranked.map((s) => s.name)).toEqual([
      'Movie.BluRay-FIRST',
      'Movie.WEBRip-SECOND',
      'Movie.HDTV-THIRD',
    ])
  })

  test('does not mutate original array', () => {
    const reference = 'Movie.1080p.BluRay-GRP'

    const subtitles = [
      { name: 'Movie.HDTV-OTHER' },
      { name: 'Movie.1080p.BluRay-GRP' },
    ]

    const original = [...subtitles]

    matcher.rank(reference, subtitles)

    expect(subtitles).toEqual(original)
  })

  test('preserves extra properties on subtitle objects', () => {
    const reference = 'Movie.1080p.BluRay-GRP'

    const subtitles = [
      { name: 'Movie.1080p.BluRay-GRP', id: 'SUB001', language: 'EN' },
    ]

    const ranked = matcher.rank(reference, subtitles)

    expect(ranked[0]).toEqual({
      name: 'Movie.1080p.BluRay-GRP',
      id: 'SUB001',
      language: 'EN',
    })
  })
})
