import { describe, expect, test } from 'bun:test'

import { Parsers } from '@/lib/parsers'

describe('Parsers.releaseName', () => {
  test('extracts group and source from standard name', () => {
    const result = Parsers.releaseName(
      'The.Matrix.1999.1080p.BluRay.x264-GROUP'
    )

    expect(result).toEqual({ group: 'GROUP', source: 'BluRay' })
  })

  test('extracts group with numbers', () => {
    const result = Parsers.releaseName('Movie.2024.2160p.WEB-DL.x265-FLUX2')

    expect(result).toEqual({ group: 'FLUX2', source: 'WEB-DL' })
  })

  test('extracts BluRay source variants', () => {
    expect(Parsers.releaseName('Movie.1080p.BluRay-GRP')).toEqual({
      group: 'GRP',
      source: 'BluRay',
    })

    expect(Parsers.releaseName('Movie.1080p.Blu-Ray-GRP')).toEqual({
      group: 'GRP',
      source: 'Blu-Ray',
    })

    expect(Parsers.releaseName('Movie.1080p.BDRip-GRP')).toEqual({
      group: 'GRP',
      source: 'BDRip',
    })

    expect(Parsers.releaseName('Movie.1080p.BRRip-GRP')).toEqual({
      group: 'GRP',
      source: 'BRRip',
    })
  })

  test('extracts WEB source variants', () => {
    expect(Parsers.releaseName('Movie.1080p.WEB-DL-GRP')).toEqual({
      group: 'GRP',
      source: 'WEB-DL',
    })

    expect(Parsers.releaseName('Movie.1080p.WEBRip-GRP')).toEqual({
      group: 'GRP',
      source: 'WEBRip',
    })

    expect(Parsers.releaseName('Movie.1080p.WEBDL-GRP')).toEqual({
      group: 'GRP',
      source: 'WEBDL',
    })
  })

  test('extracts HDTV and DVDRip sources', () => {
    expect(Parsers.releaseName('Movie.720p.HDTV-GRP')).toEqual({
      group: 'GRP',
      source: 'HDTV',
    })

    expect(Parsers.releaseName('Movie.DVDRip-GRP')).toEqual({
      group: 'GRP',
      source: 'DVDRip',
    })
  })

  test('source matching is case insensitive', () => {
    const result = Parsers.releaseName('Movie.1080p.bluray.x264-GRP')

    expect(result).toEqual({ group: 'GRP', source: 'bluray' })
  })

  test('returns null group when no hyphen-group pattern', () => {
    const result = Parsers.releaseName('The.Matrix.1999.1080p.BluRay')

    expect(result).toEqual({ group: null, source: 'BluRay' })
  })

  test('returns null source when no known source keyword', () => {
    const result = Parsers.releaseName('Some.Random.Release-GRP')

    expect(result).toEqual({ group: 'GRP', source: null })
  })

  test('returns both null when no parseable metadata', () => {
    const result = Parsers.releaseName('randomfile')

    expect(result).toEqual({ group: null, source: null })
  })

  test('handles spaces as separators', () => {
    const result = Parsers.releaseName(
      'The Matrix 1999 1080p BluRay x264-GROUP'
    )

    expect(result).toEqual({ group: 'GROUP', source: 'BluRay' })
  })

  test('handles underscores as separators', () => {
    const result = Parsers.releaseName(
      'The_Matrix_1999_1080p_BluRay_x264-GROUP'
    )

    expect(result).toEqual({ group: 'GROUP', source: 'BluRay' })
  })

  test('does not confuse WEB-DL hyphen with group separator', () => {
    const result = Parsers.releaseName('Movie.2024.1080p.WEB-DL.x265-NOGRP')

    expect(result).toEqual({ group: 'NOGRP', source: 'WEB-DL' })
  })

  test('does not confuse Blu-Ray hyphen with group separator', () => {
    const result = Parsers.releaseName('Movie.1080p.Blu-Ray.x264-TEAM')

    expect(result).toEqual({ group: 'TEAM', source: 'Blu-Ray' })
  })

  test('empty string returns both null', () => {
    const result = Parsers.releaseName('')

    expect(result).toEqual({ group: null, source: null })
  })

  test('handles TV show release names', () => {
    const result = Parsers.releaseName(
      'Breaking.Bad.S01E01.1080p.BluRay.x264-DEMAND'
    )

    expect(result).toEqual({ group: 'DEMAND', source: 'BluRay' })
  })
})

describe('Parsers.technicalPart', () => {
  test('extracts from resolution onward', () => {
    const result = Parsers.technicalPart(
      'The.Matrix.1999.1080p.BluRay.x264-GROUP'
    )

    expect(result).toBe('1080p.BluRay.x264-GROUP')
  })

  test('extracts from source when no resolution', () => {
    const result = Parsers.technicalPart('Movie.Name.BluRay.x264-GRP')

    expect(result).toBe('BluRay.x264-GRP')
  })

  test('extracts from codec when no resolution or source', () => {
    const result = Parsers.technicalPart('Movie.Name.x264-GRP')

    expect(result).toBe('x264-GRP')
  })

  test('returns full string when no technical keyword found', () => {
    const result = Parsers.technicalPart('Some.Random.Name-GRP')

    expect(result).toBe('Some.Random.Name-GRP')
  })

  test('handles 2160p resolution', () => {
    const result = Parsers.technicalPart('Movie.2024.2160p.WEB-DL.x265-FLUX')

    expect(result).toBe('2160p.WEB-DL.x265-FLUX')
  })

  test('handles 720p resolution', () => {
    const result = Parsers.technicalPart('Show.S01E01.720p.HDTV-LOL')

    expect(result).toBe('720p.HDTV-LOL')
  })

  test('handles TV show with season episode', () => {
    const result = Parsers.technicalPart(
      'Breaking.Bad.S01E01.1080p.BluRay.x264-DEMAND'
    )

    expect(result).toBe('1080p.BluRay.x264-DEMAND')
  })

  test('picks earliest technical keyword', () => {
    const result = Parsers.technicalPart('Movie.720p.1080p.BluRay-GRP')

    expect(result).toBe('720p.1080p.BluRay-GRP')
  })

  test('handles spaces as separators', () => {
    const result = Parsers.technicalPart(
      'The Matrix 1999 1080p BluRay x264-GROUP'
    )

    expect(result).toBe('1080p BluRay x264-GROUP')
  })

  test('case insensitive keyword detection', () => {
    const result = Parsers.technicalPart('Movie.Name.BLURAY.x264-GRP')

    expect(result).toBe('BLURAY.x264-GRP')
  })
})
