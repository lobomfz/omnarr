import { describe, expect, test, beforeEach } from 'bun:test'

import { DbMediaTracks } from '@/db/media-tracks'
import { Player } from '@/player/player'

import { TestSeed } from '../helpers/seed'
import {
  denseTimestamps,
  seedVadTimestamps,
  shiftTimestamps,
} from '../helpers/vad'

beforeEach(() => {
  TestSeed.reset()
})

function scaleTimestamps(timestamps: Float32Array, factor: number) {
  const result = new Float32Array(timestamps.length)

  for (let i = 0; i < timestamps.length; i++) {
    result[i] = timestamps[i] * factor
  }

  return result
}

describe('Player.resolvePlayback — audio sync', () => {
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

    const ids = await TestSeed.player.getTrackIds(file.id)
    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: ids.video.id,
      audio: ids.audio.id,
    })
    const { audioSync: result } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: null,
    })

    expect(result.offset).toBe(0)
    expect(result.speed).toBe(1)
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

    const videoIds = await TestSeed.player.getTrackIds(videoFile.id)
    const audioIds = await TestSeed.player.getTrackIds(audioFile.id)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoIds.video.id,
      audio: audioIds.audio.id,
    })

    expect(resolved.video.download_id).not.toBe(resolved.audio.download_id)

    const { audioSync: result } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: null,
    })

    expect(result.offset).toBe(0)
    expect(result.speed).toBe(1)
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

    const videoIds = await TestSeed.player.getTrackIds(videoFile.id)
    const audioIds = await TestSeed.player.getTrackIds(audioFile.id)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoIds.video.id,
      audio: audioIds.audio.id,
    })
    const { audioSync: result } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: null,
    })

    expect(result.offset).toBe(0)
    expect(result.speed).toBe(1)
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

    const videoIds = await TestSeed.player.getTrackIds(videoFile.id)
    const audioIds = await TestSeed.player.getTrackIds(audioFile.id)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoIds.video.id,
      audio: audioIds.audio.id,
    })
    const { audioSync: result } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: null,
    })

    expect(result.offset).toBe(0)
    expect(result.speed).toBe(1)
  })

  test('selected non-primary audio track uses its own VAD when video file has multiple audio tracks', async () => {
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
        {
          stream_index: 2,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: false,
          language: 'por',
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

    const videoTracks = await TestSeed.player.getTrackIds(videoFile.id)
    const videoFileTracks = await DbMediaTracks.getByMediaFileId(videoFile.id)
    const portugueseTrack = videoFileTracks.find(
      (track) => track.stream_type === 'audio' && track.language === 'por'
    )!
    const englishTrack = videoFileTracks.find(
      (track) => track.stream_type === 'audio' && track.language === 'eng'
    )!
    const audioTracks = await TestSeed.player.getTrackIds(audioFile.id)

    await TestSeed.player.vadTrack(englishTrack.id, 111)
    await TestSeed.player.vadTrack(portugueseTrack.id, 42)
    await TestSeed.player.vadTrack(audioTracks.audio.id, 42)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoTracks.video.id,
      audio: audioTracks.audio.id,
    })
    const { audioSync: result } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: null,
    })

    expect(result.offset).toBe(0)
    expect(result.speed).toBe(1)
  })

  test('different release with linear drift returns refined speed and offset', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })
    const videoDuration = 2428.896
    const audioDuration = 2537.728
    const trueSpeed = 1.04416
    const trueShiftSeconds = 1.9

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
      ],
      { duration: videoDuration }
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
      ],
      { duration: audioDuration }
    )

    const videoTracks = await TestSeed.player.getTrackIds(videoFile.id)
    const audioTracks = await TestSeed.player.getTrackIds(audioFile.id)
    const base = denseTimestamps(900, 42)
    const warped = scaleTimestamps(
      shiftTimestamps(base, trueShiftSeconds),
      trueSpeed
    )

    await seedVadTimestamps(videoTracks.audio.id, base)
    await seedVadTimestamps(audioTracks.audio.id, warped)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoTracks.video.id,
      audio: audioTracks.audio.id,
    })
    const { audioSync: result } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: null,
    })

    expect(result.speed).toBeCloseTo(trueSpeed, 3)
    expect(result.offset).toBeCloseTo(-trueShiftSeconds, 1)
  })
})
