import { beforeEach, describe, expect, test } from 'bun:test'

import { AudioCorrelator, MIN_SYNC_CONFIDENCE } from '@/audio/audio-correlator'
import { bestCorrelation } from '@/audio/correlation-utils'
import { TrackResolver } from '@/audio/track-resolver'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'

import { TestSeed } from './helpers/seed'
import {
  denseTimestamps,
  seedVadTimestamps,
  shiftTimestamps,
} from './helpers/vad'

function scaleTimestamps(timestamps: Float32Array, factor: number) {
  const result = new Float32Array(timestamps.length)

  for (let i = 0; i < timestamps.length; i++) {
    result[i] = timestamps[i] * factor
  }

  return result
}

beforeEach(() => {
  TestSeed.reset()
})

describe('TrackResolver.loadVad', () => {
  test('returns VAD for the requested track when a file has multiple audio tracks', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_video',
      '/movies/video.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
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

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const englishTrack = tracks.find((track) => track.language === 'eng')!
    const portugueseTrack = tracks.find((track) => track.language === 'por')!
    const englishVad = denseTimestamps(20, 111)
    const portugueseVad = denseTimestamps(20, 222)

    await seedVadTimestamps(englishTrack.id, englishVad)
    await seedVadTimestamps(portugueseTrack.id, portugueseVad)

    const loaded = await DbMediaVad.loadVad(portugueseTrack.id)

    expect(loaded).toEqual(portugueseVad)
  })
})

describe('TrackResolver.resolveOffset — speed detection', () => {
  test('durations within ±2% → speed=1, unscaled correlation', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_video',
      '/movies/video.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          language: 'eng',
        },
      ],
      { duration: 1000 }
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: true,
        },
      ],
      { duration: 1010 }
    )

    const videoTracks = await TestSeed.player.getTrackIds(videoFile.id)
    const audioTracks = await TestSeed.player.getTrackIds(audioFile.id)
    const base = denseTimestamps(200, 42)

    await seedVadTimestamps(videoTracks.audio.id, base)
    await seedVadTimestamps(audioTracks.audio.id, base)

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.resolveOffset(
      videoTracks.video.id,
      audioTracks.audio.id
    )

    expect(result.speed).toBe(1)
    expect(Math.abs(result.offset)).toBeLessThanOrEqual(0.1)
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('durations differ >2% → speed=ratio, B rescaled before correlation', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const videoDuration = 2428.9
    const audioDuration = 2537.7
    const expectedSpeed = audioDuration / videoDuration

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_video',
      '/movies/video.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
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
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: true,
        },
      ],
      { duration: audioDuration }
    )

    const videoTracks = await TestSeed.player.getTrackIds(videoFile.id)
    const audioTracks = await TestSeed.player.getTrackIds(audioFile.id)
    const base = denseTimestamps(200, 42)
    const stretched = scaleTimestamps(base, expectedSpeed)

    await seedVadTimestamps(videoTracks.audio.id, base)
    await seedVadTimestamps(audioTracks.audio.id, stretched)

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.resolveOffset(
      videoTracks.video.id,
      audioTracks.audio.id
    )

    expect(result.speed).toBeCloseTo(expectedSpeed, 4)
    expect(Math.abs(result.offset)).toBeLessThanOrEqual(0.1)
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('content drift refines file-derived speed and offset beyond raw duration ratio', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const videoDuration = 2428.896
    const audioDuration = 2537.728
    const trueSpeed = 1.04416
    const trueShiftSeconds = 1.9

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_video',
      '/movies/video.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
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
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: true,
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

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.resolveOffset(
      videoTracks.video.id,
      audioTracks.audio.id
    )

    expect(result.speed).toBeCloseTo(trueSpeed, 3)
    expect(result.offset).toBeCloseTo(-trueShiftSeconds, 1)
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('one file missing duration → speed=1, fallback to unscaled', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_video',
      '/movies/video.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
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
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: true,
        },
      ],
      { duration: 1000 }
    )

    const videoTracks = await TestSeed.player.getTrackIds(videoFile.id)
    const audioTracks = await TestSeed.player.getTrackIds(audioFile.id)
    const base = denseTimestamps(200, 42)

    await seedVadTimestamps(videoTracks.audio.id, base)
    await seedVadTimestamps(audioTracks.audio.id, base)

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.resolveOffset(
      videoTracks.video.id,
      audioTracks.audio.id
    )

    expect(result.speed).toBe(1)
    expect(Math.abs(result.offset)).toBeLessThanOrEqual(0.1)
  })

  test('both files missing duration → speed=1', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_video',
      '/movies/video.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
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
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: true,
        },
      ]
    )

    const videoTracks = await TestSeed.player.getTrackIds(videoFile.id)
    const audioTracks = await TestSeed.player.getTrackIds(audioFile.id)
    const base = denseTimestamps(200, 42)

    await seedVadTimestamps(videoTracks.audio.id, base)
    await seedVadTimestamps(audioTracks.audio.id, base)

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.resolveOffset(
      videoTracks.video.id,
      audioTracks.audio.id
    )

    expect(result.speed).toBe(1)
  })

  test('missing vad → speed=1, offset=0, confidence=null', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_video',
      '/movies/video.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          language: 'eng',
        },
      ],
      { duration: 1000 }
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: true,
        },
      ],
      { duration: 2000 }
    )

    const videoTracks = await TestSeed.player.getTrackIds(videoFile.id)
    const audioTracks = await TestSeed.player.getTrackIds(audioFile.id)

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.resolveOffset(
      videoTracks.video.id,
      audioTracks.audio.id
    )

    expect(result.speed).toBe(1)
    expect(result.offset).toBe(0)
    expect(result.confidence).toBeNull()
  })
})

describe('TrackResolver.resolveReferenceAudioTrack', () => {
  test('tries ordered candidates and chooses the highest-confidence video-file audio track', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_video',
      '/movies/video.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: false,
          language: 'spa',
        },
        {
          stream_index: 2,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          language: 'eng',
        },
        {
          stream_index: 3,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: false,
          language: 'por',
        },
      ],
      { duration: 1000 }
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: true,
          language: 'por',
        },
      ],
      { duration: 1000 }
    )

    const videoTracks = await DbMediaTracks.getByMediaFileId(videoFile.id)
    const targetTracks = await TestSeed.player.getTrackIds(audioFile.id)
    const base = denseTimestamps(200, 42)
    const defaultCandidate = videoTracks.find((track) => track.is_default)!
    const firstCandidate = videoTracks.find(
      (track) => track.stream_type === 'audio' && track.stream_index === 1
    )!
    const languageCandidate = videoTracks.find(
      (track) => track.stream_type === 'audio' && track.language === 'por'
    )!
    const videoTrack = videoTracks.find(
      (track) => track.stream_type === 'video'
    )!

    await seedVadTimestamps(defaultCandidate.id, denseTimestamps(200, 111))
    await seedVadTimestamps(firstCandidate.id, denseTimestamps(200, 222))
    await seedVadTimestamps(languageCandidate.id, base)
    await seedVadTimestamps(targetTracks.audio.id, base)

    const resolver = new TrackResolver({ id: media.id })
    const chosen = await resolver.resolveReferenceAudioTrack(
      videoTrack.id,
      targetTracks.audio.id
    )

    expect(chosen?.id).toBe(languageCandidate.id)
  })
})

describe('bestCorrelation', () => {
  test('returns per-candidate confidences sorted descending', () => {
    const base = denseTimestamps(200, 42)
    const speed = 25 / 23.976
    const stretched = scaleTimestamps(base, speed)

    const result = bestCorrelation(
      base,
      stretched,
      speed,
      AudioCorrelator.correlateTimestamps
    )

    expect(result.speed).toBeCloseTo(speed, 4)
    expect(result.candidates.length).toBeGreaterThan(1)
    expect(
      result.candidates.find((candidate) => candidate.speed === result.speed)
        ?.confidence
    ).toBe(result.confidence)
    expect(
      result.candidates.every((candidate, index, candidates) => {
        const previous = candidates[index - 1]

        return index === 0 || previous.confidence >= candidate.confidence
      })
    ).toBe(true)
  })
})
