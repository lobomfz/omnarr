import { describe, expect, test, beforeEach } from 'bun:test'

import { database } from '@/db/connection'
import { Player } from '@/player/player'

import { seedMedia, seedTvMedia, seedDownloadWithTracks } from './seed'

beforeEach(() => {
  database.reset()
})

describe('Player — track resolution defaults', () => {
  test('picks is_default tracks from the most recent download', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'old_hash', '/movies/old.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1280,
        height: 720,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        channel_layout: '5.1',
      },
    ])

    await seedDownloadWithTracks(media.id, 'new_hash', '/movies/new.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'hevc',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'eac3',
        is_default: true,
        channel_layout: '7.1',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})

    expect(resolved.video.codec_name).toBe('hevc')
    expect(resolved.audio.codec_name).toBe('eac3')
  })

  test('picks first by stream_index when multiple is_default of same type', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        language: 'eng',
        channel_layout: '5.1',
      },
      {
        stream_index: 2,
        stream_type: 'audio',
        codec_name: 'ac3',
        is_default: true,
        language: 'por',
        channel_layout: '5.1',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})

    expect(resolved.audio.codec_name).toBe('aac')
    expect(resolved.audio.language).toBe('eng')
  })

  test('falls back to first track when none marked is_default', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: false,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: false,
        language: 'eng',
        channel_layout: '5.1',
      },
      {
        stream_index: 2,
        stream_type: 'audio',
        codec_name: 'ac3',
        is_default: false,
        language: 'por',
        channel_layout: '5.1',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})

    expect(resolved.video.codec_name).toBe('h264')
    expect(resolved.audio.codec_name).toBe('aac')
  })

  test('subtitle defaults to none', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        channel_layout: '5.1',
      },
      {
        stream_index: 2,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: true,
        language: 'eng',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})

    expect(resolved.subtitle).toBeNull()
  })

  test('no tracks throws error', async () => {
    const media = await seedMedia()

    const player = new Player({ id: media.id })

    expect(() => player.resolveTracks({})).toThrow(/no tracks found/i)
  })
})

describe('Player — explicit track selection', () => {
  test('selects track by explicit index', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        language: 'eng',
        channel_layout: '5.1',
      },
      {
        stream_index: 2,
        stream_type: 'audio',
        codec_name: 'ac3',
        is_default: false,
        language: 'por',
        channel_layout: '5.1',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({ audio: 1 })

    expect(resolved.audio.codec_name).toBe('ac3')
    expect(resolved.audio.language).toBe('por')
  })

  test('selects subtitle when sub index is provided', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        channel_layout: '5.1',
      },
      {
        stream_index: 2,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: false,
        language: 'eng',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({ sub: 0 })

    expect(resolved.subtitle).not.toBeNull()
    expect(resolved.subtitle!.language).toBe('eng')
  })

  test('out of range index throws error with valid range', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        channel_layout: '5.1',
      },
    ])

    const player = new Player({ id: media.id })

    expect(() => player.resolveTracks({ audio: 5 })).toThrow(
      /audio.*out of range/i
    )
  })
})

describe('Player — TV episode resolution', () => {
  test('resolves only tracks from the specified episode', async () => {
    const { media, episodes } = await seedTvMedia()

    await seedDownloadWithTracks(
      media.id,
      'hash1',
      '/tv/Breaking.Bad.S01E01.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          language: 'eng',
        },
      ],
      { episode_id: episodes[0].id }
    )

    await seedDownloadWithTracks(
      media.id,
      'hash2',
      '/tv/Breaking.Bad.S01E02.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'hevc',
          is_default: true,
          width: 3840,
          height: 2160,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'eac3',
          is_default: true,
          language: 'por',
        },
      ],
      { episode_id: episodes[1].id }
    )

    const playerEp1 = new Player({ id: media.id, episode_id: episodes[0].id })
    const resolved1 = await playerEp1.resolveTracks({})

    expect(resolved1.video.codec_name).toBe('h264')
    expect(resolved1.audio.language).toBe('eng')

    const playerEp2 = new Player({ id: media.id, episode_id: episodes[1].id })
    const resolved2 = await playerEp2.resolveTracks({})

    expect(resolved2.video.codec_name).toBe('hevc')
    expect(resolved2.audio.language).toBe('por')
  })

  test('track selection works scoped to episode', async () => {
    const { media, episodes } = await seedTvMedia()

    await seedDownloadWithTracks(
      media.id,
      'hash1',
      '/tv/Breaking.Bad.S01E01.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          language: 'eng',
        },
        {
          stream_index: 2,
          stream_type: 'audio',
          codec_name: 'ac3',
          is_default: false,
          language: 'por',
        },
      ],
      { episode_id: episodes[0].id }
    )

    const player = new Player({ id: media.id, episode_id: episodes[0].id })
    const resolved = await player.resolveTracks({ audio: 1 })

    expect(resolved.audio.codec_name).toBe('ac3')
    expect(resolved.audio.language).toBe('por')
  })

  test('throws when episode has no tracks', async () => {
    const { media, episodes } = await seedTvMedia()

    const player = new Player({ id: media.id, episode_id: episodes[2].id })

    expect(() => player.resolveTracks({})).toThrow(/no tracks found/i)
  })
})
