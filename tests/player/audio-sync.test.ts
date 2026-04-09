import { describe, expect, test, beforeEach } from 'bun:test'

import { Player } from '@/player/player'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

describe('Player.resolveAudioOffset', () => {
  test('same download_id → no correlation, offset is 0', async () => {
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
        },
      ]
    )

    await TestSeed.player.vad(file.id, 42)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})
    const offset = await player.resolveAudioOffset(resolved)

    expect(offset).toBe(0)
  })

  test('different download_id with vad data → offset applied', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'torrent_hash',
      '/movies/video.mkv',
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
      ]
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'ripper_hash',
      '/tracks/audio_pt.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: true,
          language: 'por',
        },
      ]
    )

    await TestSeed.player.vad(videoFile.id, 42)
    await TestSeed.player.vad(audioFile.id, 42)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})

    expect(resolved.video.download_id).not.toBe(resolved.audio.download_id)

    const offset = await player.resolveAudioOffset(resolved)

    expect(offset).toBe(0)
  })

  test('different download_id with missing vad → offset is 0', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'torrent_hash',
      '/movies/video.mkv',
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
        },
      ]
    )

    await TestSeed.player.downloadWithTracks(
      media.id,
      'ripper_hash',
      '/tracks/audio_pt.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: true,
          language: 'por',
        },
      ]
    )

    await TestSeed.player.vad(videoFile.id, 42)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})
    const offset = await player.resolveAudioOffset(resolved)

    expect(offset).toBe(0)
  })

  test('different download_id with low confidence → offset is 0', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'torrent_hash',
      '/movies/video.mkv',
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
        },
      ]
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'ripper_hash',
      '/tracks/audio_pt.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: true,
          language: 'por',
        },
      ]
    )

    await TestSeed.player.vad(videoFile.id, 111)
    await TestSeed.player.vad(audioFile.id, 222)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})
    const offset = await player.resolveAudioOffset(resolved)

    expect(offset).toBe(0)
  })
})
