import { describe, expect, test } from 'bun:test'

import { Parsers } from '@/lib/parsers'

describe('Parsers.releaseName', () => {
  test('extracts group and source from standard name', () => {
    const result = Parsers.releaseName(
      'The.Matrix.1999.1080p.BluRay.x264-GROUP'
    )

    expect(result).toEqual({ group: 'group', source: 'bluray' })
  })

  test('extracts group with numbers', () => {
    const result = Parsers.releaseName('Movie.2024.2160p.WEB-DL.x265-FLUX2')

    expect(result).toEqual({ group: 'flux2', source: 'web-dl' })
  })

  test('extracts BluRay source variants', () => {
    expect(Parsers.releaseName('Movie.1080p.BluRay-GRP')).toEqual({
      group: 'grp',
      source: 'bluray',
    })

    expect(Parsers.releaseName('Movie.1080p.Blu-Ray-GRP')).toEqual({
      group: 'grp',
      source: 'blu-ray',
    })

    expect(Parsers.releaseName('Movie.1080p.BDRip-GRP')).toEqual({
      group: 'grp',
      source: 'bdrip',
    })

    expect(Parsers.releaseName('Movie.1080p.BRRip-GRP')).toEqual({
      group: 'grp',
      source: 'brrip',
    })
  })

  test('extracts WEB source variants', () => {
    expect(Parsers.releaseName('Movie.1080p.WEB-DL-GRP')).toEqual({
      group: 'grp',
      source: 'web-dl',
    })

    expect(Parsers.releaseName('Movie.1080p.WEBRip-GRP')).toEqual({
      group: 'grp',
      source: 'webrip',
    })

    expect(Parsers.releaseName('Movie.1080p.WEBDL-GRP')).toEqual({
      group: 'grp',
      source: 'webdl',
    })
  })

  test('extracts HDTV and DVDRip sources', () => {
    expect(Parsers.releaseName('Movie.720p.HDTV-GRP')).toEqual({
      group: 'grp',
      source: 'hdtv',
    })

    expect(Parsers.releaseName('Movie.DVDRip-GRP')).toEqual({
      group: 'grp',
      source: 'dvdrip',
    })
  })

  test('source matching is case insensitive', () => {
    const result = Parsers.releaseName('Movie.1080p.bluray.x264-GRP')

    expect(result).toEqual({ group: 'grp', source: 'bluray' })
  })

  test('returns null group when no hyphen-group pattern', () => {
    const result = Parsers.releaseName('The.Matrix.1999.1080p.BluRay')

    expect(result).toEqual({ group: null, source: 'bluray' })
  })

  test('returns null source when no known source keyword', () => {
    const result = Parsers.releaseName('Some.Random.Release-GRP')

    expect(result).toEqual({ group: 'grp', source: null })
  })

  test('returns both null when no parseable metadata', () => {
    const result = Parsers.releaseName('randomfile')

    expect(result).toEqual({ group: null, source: null })
  })

  test('handles spaces as separators', () => {
    const result = Parsers.releaseName(
      'The Matrix 1999 1080p BluRay x264-GROUP'
    )

    expect(result).toEqual({ group: 'group', source: 'bluray' })
  })

  test('handles underscores as separators', () => {
    const result = Parsers.releaseName(
      'The_Matrix_1999_1080p_BluRay_x264-GROUP'
    )

    expect(result).toEqual({ group: 'group', source: 'bluray' })
  })

  test('does not confuse WEB-DL hyphen with group separator', () => {
    const result = Parsers.releaseName('Movie.2024.1080p.WEB-DL.x265-NOGRP')

    expect(result).toEqual({ group: 'nogrp', source: 'web-dl' })
  })

  test('does not confuse Blu-Ray hyphen with group separator', () => {
    const result = Parsers.releaseName('Movie.1080p.Blu-Ray.x264-TEAM')

    expect(result).toEqual({ group: 'team', source: 'blu-ray' })
  })

  test('empty string returns both null', () => {
    const result = Parsers.releaseName('')

    expect(result).toEqual({ group: null, source: null })
  })

  test('handles TV show release names', () => {
    const result = Parsers.releaseName(
      'Breaking.Bad.S01E01.1080p.BluRay.x264-DEMAND'
    )

    expect(result).toEqual({ group: 'demand', source: 'bluray' })
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
