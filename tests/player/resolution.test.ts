import { describe, expect, test, beforeEach } from 'bun:test'

import { DbMediaTracks } from '@/db/media-tracks'
import { Player } from '@/player/player'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

describe('Player — explicit track selection by ID', () => {
  test('selects tracks by database ID', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
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
      ]
    )

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const video = tracks.find((t) => t.stream_type === 'video')!
    const porAudio = tracks.find((t) => t.language === 'por')!

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: video.id,
      audio: porAudio.id,
    })

    expect(resolved.audio.codec_name).toBe('ac3')
    expect(resolved.audio.language).toBe('por')
  })

  test('selects subtitle when sub ID is provided', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
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
          channel_layout: '5.1',
        },
        {
          stream_index: 2,
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: false,
          language: 'eng',
        },
      ]
    )

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const video = tracks.find((t) => t.stream_type === 'video')!
    const audio = tracks.find((t) => t.stream_type === 'audio')!
    const sub = tracks.find((t) => t.stream_type === 'subtitle')!

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: video.id,
      audio: audio.id,
      sub: sub.id,
    })

    expect(resolved.subtitle).not.toBeNull()
    expect(resolved.subtitle!.language).toBe('eng')
  })

  test('subtitle defaults to none when sub ID not provided', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
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
          channel_layout: '5.1',
        },
        {
          stream_index: 2,
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: true,
          language: 'eng',
        },
      ]
    )

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const video = tracks.find((t) => t.stream_type === 'video')!
    const audio = tracks.find((t) => t.stream_type === 'audio')!

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: video.id,
      audio: audio.id,
    })

    expect(resolved.subtitle).toBeNull()
  })

  test('nonexistent track ID throws error', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
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
          channel_layout: '5.1',
        },
      ]
    )

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const video = tracks.find((t) => t.stream_type === 'video')!

    const player = new Player({ id: media.id })

     expect(() =>
      player.resolveTracks({ video: video.id, audio: 99999 })
    ).toThrow(/TRACK_NOT_FOUND/)
  })

  test('no tracks throws NO_TRACKS error', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const player = new Player({ id: media.id })

    expect(() => player.resolveTracks({ video: 1, audio: 2 })).toThrow(
      /NO_TRACKS/
    )
  })
})

describe('Player — TV episode resolution', () => {
  test('resolves only tracks from the specified episode', async () => {
    const { media, episodes } = await TestSeed.library.tv({
      tmdbId: 1396,
      title: 'Breaking Bad',
      year: 2008,
      imdbId: 'tt0903747',
      rootFolder: '/tv',
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodeCount: 3,
          episodes: [
            { episodeNumber: 1, title: 'Pilot' },
            { episodeNumber: 2, title: "Cat's in the Bag..." },
            { episodeNumber: 3, title: "...And the Bag's in the River" },
          ],
        },
      ],
    })

    const { file: file1 } = await TestSeed.player.downloadWithTracks(
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

    const { file: file2 } = await TestSeed.player.downloadWithTracks(
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

    const tracks1 = await DbMediaTracks.getByMediaFileId(file1.id)
    const tracks2 = await DbMediaTracks.getByMediaFileId(file2.id)

    const playerEp1 = new Player({ id: media.id, episode_id: episodes[0].id })
    const resolved1 = await playerEp1.resolveTracks({
      video: tracks1.find((t) => t.stream_type === 'video')!.id,
      audio: tracks1.find((t) => t.stream_type === 'audio')!.id,
    })

    expect(resolved1.video.codec_name).toBe('h264')
    expect(resolved1.audio.language).toBe('eng')

    const playerEp2 = new Player({ id: media.id, episode_id: episodes[1].id })
    const resolved2 = await playerEp2.resolveTracks({
      video: tracks2.find((t) => t.stream_type === 'video')!.id,
      audio: tracks2.find((t) => t.stream_type === 'audio')!.id,
    })

    expect(resolved2.video.codec_name).toBe('hevc')
    expect(resolved2.audio.language).toBe('por')
  })

  test('throws when episode has no tracks', async () => {
    const { media, episodes } = await TestSeed.library.tv({
      tmdbId: 1396,
      title: 'Breaking Bad',
      year: 2008,
      imdbId: 'tt0903747',
      rootFolder: '/tv',
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodeCount: 3,
          episodes: [
            { episodeNumber: 1, title: 'Pilot' },
            { episodeNumber: 2, title: "Cat's in the Bag..." },
            { episodeNumber: 3, title: "...And the Bag's in the River" },
          ],
        },
      ],
    })

    const player = new Player({ id: media.id, episode_id: episodes[2].id })

    expect(() => player.resolveTracks({ video: 1, audio: 2 })).toThrow(
      /NO_TRACKS/
    )
  })
})
