import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { DbMediaTracks } from '@/db/media-tracks'
import { playerSession } from '@/player/player-session'

import { TestSeed } from '../helpers/seed'

const client = createRouterClient(router)

beforeEach(() => {
  TestSeed.reset()
})

afterEach(async () => {
  await playerSession.stop()
})

describe('player.start', () => {
  test('returns HLS path and resolved track info for valid track IDs', async () => {
    const { media, video, audio } = await TestSeed.player.movieWithTracks()

    const result = await client.player.start({
      media_id: media.id,
      video: video.id,
      audio: audio.id,
    })

    expect(result.hlsPath).toBe(`/hls/${media.id}/master.m3u8`)
    expect(result.video.codec_name).toBe('h264')
    expect(result.audio.codec_name).toBe('aac')
    expect(result.subtitle).toBeNull()
    expect(result.audioOffset).toBe(0)
    expect(result.subtitleOffset).toBe(0)
  })

  test('throws TRACK_NOT_FOUND when media does not exist', async () => {
     expect(() =>
      client.player.start({ media_id: 'NONEX', video: 1, audio: 2 })
    ).toThrow(expect.objectContaining({ code: 'TRACK_NOT_FOUND' }))
  })

  test('throws TRACK_NOT_FOUND when track belongs to different media', async () => {
    const { video, audio } = await TestSeed.player.movieWithTracks()

     expect(() =>
      client.player.start({
        media_id: 'DIFFER',
        video: video.id,
        audio: audio.id,
      })
    ).toThrow(expect.objectContaining({ code: 'TRACK_NOT_FOUND' }))
  })

  test('throws TRACK_NOT_FOUND when media has no scanned tracks', async () => {
    const media = await TestSeed.library.matrix()

    await TestSeed.downloads.completed(media.id)

     expect(() =>
      client.player.start({ media_id: media.id, video: 999, audio: 999 })
    ).toThrow(expect.objectContaining({ code: 'TRACK_NOT_FOUND' }))
  })

  test('throws NO_KEYFRAMES when tracks exist but no keyframes', async () => {
    const media = await TestSeed.library.matrix()

    const { file } = await TestSeed.player.downloadWithTracks(
      media.id,
      'matrix-1080p',
      '/movies/The.Matrix.1999.mkv',
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
          channels: 6,
        },
      ]
    )

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const video = tracks.find((t) => t.stream_type === 'video')!
    const audio = tracks.find((t) => t.stream_type === 'audio')!

     expect(() =>
      client.player.start({
        media_id: media.id,
        video: video.id,
        audio: audio.id,
      })
    ).toThrow(expect.objectContaining({ code: 'NO_KEYFRAMES' }))

    expect(playerSession.active).toBe(false)
  })

  test('throws TRACK_NOT_FOUND when video track ID does not match any track', async () => {
    const { media, audio } = await TestSeed.player.movieWithTracks()

     expect(() =>
      client.player.start({
        media_id: media.id,
        video: 99999,
        audio: audio.id,
      })
    ).toThrow(expect.objectContaining({ code: 'TRACK_NOT_FOUND' }))
  })

  test('throws TRACK_NOT_FOUND when track ID exists but is wrong type', async () => {
    const { media, video, audio } = await TestSeed.player.movieWithTracks()

     expect(() =>
      client.player.start({
        media_id: media.id,
        video: audio.id,
        audio: video.id,
      })
    ).toThrow(expect.objectContaining({ code: 'TRACK_NOT_FOUND' }))
  })

  test('throws TRACK_EPISODE_MISMATCH when tracks belong to different episodes', async () => {
    const { media, episodes } = await TestSeed.library.tv({
      tmdbId: 1396,
      title: 'Breaking Bad',
      year: 2008,
      imdbId: 'tt0903747',
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodeCount: 2,
          episodes: [
            { episodeNumber: 1, title: 'Pilot' },
            { episodeNumber: 2, title: "Cat's in the Bag..." },
          ],
        },
      ],
    })

    const { file: file1 } = await TestSeed.player.downloadWithTracks(
      media.id,
      'bb-s01e01',
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
          channels: 2,
        },
      ],
      { keyframes: [0, 10], duration: 20, episode_id: episodes[0].id }
    )

    const { file: file2 } = await TestSeed.player.downloadWithTracks(
      media.id,
      'bb-s01e02',
      '/tv/Breaking.Bad.S01E02.mkv',
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
          channels: 2,
        },
      ],
      { keyframes: [0, 10], duration: 20, episode_id: episodes[1].id }
    )

    const tracks1 = await DbMediaTracks.getByMediaFileId(file1.id)
    const tracks2 = await DbMediaTracks.getByMediaFileId(file2.id)
    const videoEp1 = tracks1.find((t) => t.stream_type === 'video')!
    const audioEp2 = tracks2.find((t) => t.stream_type === 'audio')!

     expect(() =>
      client.player.start({
        media_id: media.id,
        video: videoEp1.id,
        audio: audioEp2.id,
      })
    ).toThrow(expect.objectContaining({ code: 'TRACK_EPISODE_MISMATCH' }))
  })

  test('kills previous session when starting new one', async () => {
    const { media, video, audio } = await TestSeed.player.movieWithTracks()

    await client.player.start({
      media_id: media.id,
      video: video.id,
      audio: audio.id,
    })

    expect(playerSession.active).toBe(true)

    const result = await client.player.start({
      media_id: media.id,
      video: video.id,
      audio: audio.id,
    })

    expect(result.hlsPath).toBe(`/hls/${media.id}/master.m3u8`)
    expect(playerSession.active).toBe(true)
  })
})

describe('subtitle support', () => {
  const SRT_PATH = join(tmpdir(), 'omnarr-test-subtitle.srt')
  const SRT_CONTENT = [
    '1',
    '00:00:05,000 --> 00:00:08,000',
    'Hello, World!',
    '',
    '2',
    '00:00:15,000 --> 00:00:18,000',
    'Second subtitle',
    '',
  ].join('\n')

  beforeEach(async () => {
    await Bun.write(SRT_PATH, SRT_CONTENT)
  })

  test('resolves subtitle and includes it in HLS output for standalone srt', async () => {
    const media = await TestSeed.library.matrix()

    const { file: mainFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'matrix-1080p',
      '/movies/The.Matrix.1999.mkv',
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
          channels: 6,
          channel_layout: '5.1',
        },
      ],
      { keyframes: [0, 10, 20], duration: 30 }
    )

    const { file: subFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'matrix-subs',
      SRT_PATH,
      [
        {
          stream_index: 0,
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: false,
          language: 'por',
        },
      ]
    )

    const mainTracks = await DbMediaTracks.getByMediaFileId(mainFile.id)
    const subTracks = await DbMediaTracks.getByMediaFileId(subFile.id)

    const video = mainTracks.find((t) => t.stream_type === 'video')!
    const audio = mainTracks.find((t) => t.stream_type === 'audio')!
    const sub = subTracks.find((t) => t.stream_type === 'subtitle')!

    const result = await client.player.start({
      media_id: media.id,
      video: video.id,
      audio: audio.id,
      sub: sub.id,
    })

    expect(result.subtitle).not.toBeNull()
    expect(result.subtitle!.codec_name).toBe('subrip')

    const masterReq = new Request(
      `http://localhost/hls/${media.id}/master.m3u8`
    )
    const masterRes = await playerSession.handle(masterReq)
    const masterContent = await masterRes.text()

    expect(masterContent).toContain('TYPE=SUBTITLES')
    expect(masterContent).toContain('subs.m3u8')

    const subsReq = new Request(`http://localhost/hls/${media.id}/subs.m3u8`)
    const subsRes = await playerSession.handle(subsReq)
    const subsContent = await subsRes.text()

    expect(subsContent).toContain('.vtt')
  })

  test('extracts embedded subtitle from container via ffmpeg', async () => {
    const containerPath = join(tmpdir(), 'omnarr-test-container.mkv')
    await Bun.write(
      containerPath,
      new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00])
    )

    const media = await TestSeed.library.matrix()

    const { file } = await TestSeed.player.downloadWithTracks(
      media.id,
      'matrix-1080p',
      containerPath,
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
          channels: 6,
        },
        {
          stream_index: 2,
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: false,
          language: 'por',
        },
      ],
      { keyframes: [0, 10, 20], duration: 30 }
    )

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const video = tracks.find((t) => t.stream_type === 'video')!
    const audio = tracks.find((t) => t.stream_type === 'audio')!
    const sub = tracks.find((t) => t.stream_type === 'subtitle')!

    // Invalid container — FFmpeg should fail to extract, not silently produce empty subs
     expect(() =>
      client.player.start({
        media_id: media.id,
        video: video.id,
        audio: audio.id,
        sub: sub.id,
      })
    ).toThrow()
  })
})

describe('player.stop', () => {
  test('cleans up active session', async () => {
    const { media, video, audio } = await TestSeed.player.movieWithTracks()

    await client.player.start({
      media_id: media.id,
      video: video.id,
      audio: audio.id,
    })

    expect(playerSession.active).toBe(true)

    await client.player.stop()

    expect(playerSession.active).toBe(false)
  })

  test('is a no-op when no session is active', async () => {
    expect(playerSession.active).toBe(false)

    await client.player.stop()

    expect(playerSession.active).toBe(false)
  })
})
