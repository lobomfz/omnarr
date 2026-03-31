import { describe, expect, test } from 'bun:test'

import { Parsers } from '@/parsers'

describe('Parsers.seasonEpisode', () => {
  test('S01E05', () => {
    const result = Parsers.seasonEpisode('Show.Name.S01E05.720p.BluRay')

    expect(result).toEqual({ season_number: 1, episode_number: 5 })
  })

  test('S01.E05', () => {
    const result = Parsers.seasonEpisode('Show.Name.S01.E05.720p')

    expect(result).toEqual({ season_number: 1, episode_number: 5 })
  })

  test('1x05', () => {
    const result = Parsers.seasonEpisode('Show.Name.1x05.720p')

    expect(result).toEqual({ season_number: 1, episode_number: 5 })
  })

  test('S01 season pack', () => {
    const result = Parsers.seasonEpisode('Show.Name.S01.COMPLETE.720p')

    expect(result).toEqual({ season_number: 1, episode_number: null })
  })

  test('Season 1', () => {
    const result = Parsers.seasonEpisode('Show Name Season 1 720p')

    expect(result).toEqual({ season_number: 1, episode_number: null })
  })

  test('Season.1', () => {
    const result = Parsers.seasonEpisode('Show.Name.Season.1.720p')

    expect(result).toEqual({ season_number: 1, episode_number: null })
  })

  test('S01E01E02 multi-episode returns first', () => {
    const result = Parsers.seasonEpisode('Show.Name.S01E01E02.720p')

    expect(result).toEqual({ season_number: 1, episode_number: 1 })
  })

  test('unrecognized returns nulls', () => {
    const result = Parsers.seasonEpisode('The.Matrix.1999.2160p.UHD')

    expect(result).toEqual({ season_number: null, episode_number: null })
  })

  test('case insensitive', () => {
    const result = Parsers.seasonEpisode('show.name.s02e10.720p')

    expect(result).toEqual({ season_number: 2, episode_number: 10 })
  })

  test('S00E01 specials', () => {
    const result = Parsers.seasonEpisode('Show.Name.S00E01.Special')

    expect(result).toEqual({ season_number: 0, episode_number: 1 })
  })

  test('double digit season and episode', () => {
    const result = Parsers.seasonEpisode('Show.Name.S12E24.720p')

    expect(result).toEqual({ season_number: 12, episode_number: 24 })
  })

  test('resolution WxH not parsed as season/episode', () => {
    const result = Parsers.seasonEpisode('The.Matrix.1999.1920x1080.BluRay')

    expect(result).toEqual({ season_number: null, episode_number: null })
  })
})
