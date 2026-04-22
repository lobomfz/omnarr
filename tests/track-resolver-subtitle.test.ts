import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { MIN_SYNC_CONFIDENCE } from '@/audio/audio-correlator'
import { scaleTimestamps } from '@/audio/correlation-refine'
import { TrackResolver } from '@/audio/track-resolver'
import { DbMediaTracks } from '@/db/media-tracks'
import { Player } from '@/player/player'

import { TestSeed } from './helpers/seed'
import {
  denseTimestamps,
  seedVadTimestamps,
  shiftTimestamps,
  timestampsToSrt,
} from './helpers/vad'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-track-subs-'))

beforeEach(() => {
  TestSeed.reset()
})

describe('TrackResolver.correlateSubtitle — speed detection', () => {
  test('srt duration within ±2% of video → speed=1, unscaled correlation', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const base = denseTimestamps(200, 42)
    const videoDuration = base.at(-1)!

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ],
      { duration: videoDuration }
    )

    const audioTrack = (await TestSeed.player.getTrackIds(audioFile.id)).audio

    await seedVadTimestamps(audioTrack.id, base)

    const srtPath = join(tmpDir, 'match.srt')
    await Bun.write(srtPath, timestampsToSrt(base))

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.correlateSubtitle(audioTrack.id, srtPath)

    expect(result.speed).toBe(1)
    expect(Math.abs(result.offset)).toBeLessThanOrEqual(0.1)
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('srt duration differs >2% from video → speed=ratio, srt rescaled', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const base = denseTimestamps(200, 42)
    const videoDuration = base.at(-1)!
    const expectedSpeed = 1.0448
    const stretched = scaleTimestamps(base, expectedSpeed)

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ],
      { duration: videoDuration }
    )

    const audioTrack = (await TestSeed.player.getTrackIds(audioFile.id)).audio

    await seedVadTimestamps(audioTrack.id, base)

    const srtPath = join(tmpDir, 'stretched.srt')
    await Bun.write(srtPath, timestampsToSrt(stretched))

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.correlateSubtitle(audioTrack.id, srtPath)

    expect(result.speed).toBeCloseTo(expectedSpeed, 3)
    expect(Math.abs(result.offset)).toBeLessThanOrEqual(0.1)
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('missing video duration → speed=1, fallback to unscaled', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const base = denseTimestamps(200, 42)

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ]
    )

    const audioTrack = (await TestSeed.player.getTrackIds(audioFile.id)).audio

    await seedVadTimestamps(audioTrack.id, base)

    const srtPath = join(tmpDir, 'missing.srt')
    await Bun.write(srtPath, timestampsToSrt(base))

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.correlateSubtitle(audioTrack.id, srtPath)

    expect(result.speed).toBe(1)
  })

  test('missing vad → speed=1, confidence=null', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ],
      { duration: 1000 }
    )

    const srtPath = join(tmpDir, 'novad.srt')
    await Bun.write(srtPath, timestampsToSrt(denseTimestamps(50, 7)))

    const resolver = new TrackResolver({ id: media.id })
    const audioTrack = (await TestSeed.player.getTrackIds(audioFile.id)).audio
    const result = await resolver.correlateSubtitle(audioTrack.id, srtPath)

    expect(result.speed).toBe(1)
    expect(result.confidence).toBeNull()
    expect(result.offset).toBe(0)
  })

  test('embedded subtitle track in container is extracted before correlation', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })
    const base = denseTimestamps(24, 42)
    const videoDuration = (base.at(-1) ?? 0) + 1

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ],
      { duration: videoDuration }
    )

    const audioTrack = (await TestSeed.player.getTrackIds(audioFile.id)).audio
    await seedVadTimestamps(audioTrack.id, base)

    const srtPath = join(tmpDir, 'embedded-source.srt')
    const mkvPath = join(tmpDir, 'embedded-subs.mkv')

    await Bun.write(srtPath, timestampsToSrt(base))

    await new FFmpegBuilder({ overwrite: true })
      .rawInput('-f', 'lavfi')
      .input(`color=c=black:s=320x240:d=${videoDuration}:r=24`)
      .rawInput('-f', 'lavfi')
      .input('anullsrc=r=48000:cl=stereo')
      .input(srtPath)
      .duration(videoDuration)
      .codec('v', 'libx264')
      .preset('ultrafast')
      .codec('a', 'aac')
      .codec('s', 'subrip')
      .output(mkvPath)
      .run()

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.correlateSubtitle(audioTrack.id, mkvPath, 2)

    expect(result.confidence).not.toBeNull()
    expect(result.confidence!).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })
})

describe('TrackResolver.correlateSubtitle — propagates speed', () => {
  test('stretched srt passes threshold → returns speed=ratio', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const base = denseTimestamps(200, 42)
    const videoDuration = base.at(-1)!
    const expectedSpeed = 1.0448
    const stretched = scaleTimestamps(base, expectedSpeed)

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ],
      { duration: videoDuration }
    )

    const audioTrack = (await TestSeed.player.getTrackIds(audioFile.id)).audio

    await seedVadTimestamps(audioTrack.id, base)

    const srtPath = join(tmpDir, 'resolve-stretched.srt')
    await Bun.write(srtPath, timestampsToSrt(stretched))

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.correlateSubtitle(audioTrack.id, srtPath)

    expect(result.speed).toBeCloseTo(expectedSpeed, 3)
    expect(result.confidence).not.toBeNull()
    expect(result.confidence!).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('content drift refines file-derived speed and offset beyond raw duration ratio', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const base = denseTimestamps(900, 42)
    const videoDuration = base.at(-1)!
    const expectedSpeed = 1.04416
    const expectedShiftSeconds = 1.9
    const warped = scaleTimestamps(
      shiftTimestamps(base, expectedShiftSeconds),
      expectedSpeed
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ],
      { duration: videoDuration }
    )

    const audioTrack = (await TestSeed.player.getTrackIds(audioFile.id)).audio

    await seedVadTimestamps(audioTrack.id, base)

    const srtPath = join(tmpDir, 'resolve-refined.srt')
    await Bun.write(srtPath, timestampsToSrt(warped))

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.correlateSubtitle(audioTrack.id, srtPath)

    expect(result.speed).toBeCloseTo(expectedSpeed, 3)
    expect(result.offset).toBeCloseTo(-expectedShiftSeconds, 1)
    expect(result.confidence).not.toBeNull()
    expect(result.confidence!).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('resolvePlayback composes subtitle→audio with audio→video offset', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const videoDuration = 1500
    const audioOffsetSeconds = 4
    const subtitleOffsetSeconds = 2.5
    const base = denseTimestamps(400, 42)
    const audioVad = shiftTimestamps(base, audioOffsetSeconds)
    const subtitleTimestamps = shiftTimestamps(audioVad, subtitleOffsetSeconds)

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
      { duration: videoDuration }
    )

    const srtPath = join(tmpDir, 'composed.srt')
    await Bun.write(srtPath, timestampsToSrt(subtitleTimestamps))

    const { file: subFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_sub',
      srtPath,
      [
        {
          stream_index: 0,
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: false,
        },
      ]
    )

    const videoTracks = await TestSeed.player.getTrackIds(videoFile.id)
    const audioTracks = await TestSeed.player.getTrackIds(audioFile.id)
    const subTracks = await DbMediaTracks.getByMediaFileId(subFile.id)

    await seedVadTimestamps(videoTracks.audio.id, base)
    await seedVadTimestamps(audioTracks.audio.id, audioVad)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoTracks.video.id,
      audio: audioTracks.audio.id,
      sub: subTracks[0].id,
    })
    const { audioSync, subtitleSync } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: resolved.subtitle,
    })

    expect(audioSync.applied).toBe(true)
    expect(audioSync.offset).toBeCloseTo(-audioOffsetSeconds, 1)
    expect(subtitleSync.confidence).not.toBeNull()
    expect(subtitleSync.offset).toBeCloseTo(
      -(audioOffsetSeconds + subtitleOffsetSeconds),
      1
    )
  })

  test('low confidence garbage input returns result below MIN_SYNC_CONFIDENCE', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const videoDuration = 1000

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash_audio',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ],
      { duration: videoDuration }
    )

    const vad = denseTimestamps(200, 111)
    const srtTimestamps = denseTimestamps(200, 999)

    const audioTrack = (await TestSeed.player.getTrackIds(audioFile.id)).audio

    await seedVadTimestamps(audioTrack.id, vad)

    const srtPath = join(tmpDir, 'resolve-garbage.srt')
    await Bun.write(srtPath, timestampsToSrt(srtTimestamps))

    const resolver = new TrackResolver({ id: media.id })
    const result = await resolver.correlateSubtitle(audioTrack.id, srtPath)

    expect(result.confidence).not.toBeNull()
    expect(result.confidence!).toBeLessThan(MIN_SYNC_CONFIDENCE)
  })
})
