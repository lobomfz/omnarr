import { describe, expect, test, beforeEach } from 'bun:test'

import { database } from '@/db/connection'
import { Player } from '@/player/player'

import { seedMedia, seedDownloadWithTracks, seedEnvelope } from './seed'

beforeEach(() => {
  database.reset()
})

describe('Player.resolveAudioOffset', () => {
  test('same download_id → no correlation, offset is 0', async () => {
    const media = await seedMedia()

    const { file } = await seedDownloadWithTracks(
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

    await seedEnvelope(file.id, 42)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})
    const offset = await player.resolveAudioOffset(resolved)

    expect(offset).toBe(0)
  })

  test('different download_id with envelopes → offset applied', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
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

    const { file: audioFile } = await seedDownloadWithTracks(
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

    await seedEnvelope(videoFile.id, 42)
    await seedEnvelope(audioFile.id, 42)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})

    expect(resolved.video.download_id).not.toBe(resolved.audio.download_id)

    const offset = await player.resolveAudioOffset(resolved)

    expect(offset).toBe(0)
  })

  test('different download_id with missing envelope → offset is 0', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
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

    await seedDownloadWithTracks(
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

    await seedEnvelope(videoFile.id, 42)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})
    const offset = await player.resolveAudioOffset(resolved)

    expect(offset).toBe(0)
  })

  test('different download_id with low confidence → offset is 0', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
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

    const { file: audioFile } = await seedDownloadWithTracks(
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

    await seedEnvelope(videoFile.id, 111)
    await seedEnvelope(audioFile.id, 222)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})
    const offset = await player.resolveAudioOffset(resolved)

    expect(offset).toBe(0)
  })
})
