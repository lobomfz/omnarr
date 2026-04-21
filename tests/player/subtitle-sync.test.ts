import {
  describe,
  expect,
  test,
  beforeEach,
  beforeAll,
  afterAll,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { MIN_SYNC_CONFIDENCE } from '@/audio/audio-correlator'
import { DbMediaTracks } from '@/db/media-tracks'
import { Player } from '@/player/player'

import { TestSeed } from '../helpers/seed'
import {
  denseTimestamps,
  seedVadTimestamps,
  shiftTimestamps,
  timestampsToSrt,
} from '../helpers/vad'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-subsync-'))

const SRT_CONTENT = `1
00:00:01,500 --> 00:00:04,000
Hello world

2
00:00:10,000 --> 00:00:15,000
Second line

3
00:00:20,000 --> 00:00:25,000
Third line

4
00:00:30,000 --> 00:00:35,000
Fourth line

5
00:00:40,000 --> 00:00:45,000
Fifth line
`

const srtPath = join(tmpDir, 'sub_en.srt')

beforeAll(async () => {
  await Bun.write(srtPath, SRT_CONTENT)
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

beforeEach(() => {
  TestSeed.reset()
})

describe('Player.resolvePlayback — subtitle sync', () => {
  test('no subtitle selected → offset is 0', async () => {
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

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const video = tracks.find((t) => t.stream_type === 'video')!
    const audio = tracks.find((t) => t.stream_type === 'audio')!

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: video.id,
      audio: audio.id,
    })
    const { subtitleSync: offset } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: resolved.subtitle,
    })

    expect(offset).toEqual({ offset: 0, confidence: null, speed: 1 })
  })

  test('same download_id → offset is 0', async () => {
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
        {
          stream_index: 2,
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: false,
        },
      ]
    )

    await TestSeed.player.vad(file.id, 42)

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
    const { subtitleSync: offset } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: resolved.subtitle,
    })

    expect(offset).toEqual({ offset: 0, confidence: null, speed: 1 })
  })

  test('embedded subtitle in the video file is correlated against the video timeline when external audio is selected', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })
    const base = denseTimestamps(24, 42)
    const shiftedSubtitle = shiftTimestamps(base, 1.5)
    const videoDuration = (base.at(-1) ?? 0) + 1
    const embeddedSrtPath = join(tmpDir, 'embedded-shifted.srt')
    const embeddedMkvPath = join(tmpDir, 'embedded-shifted.mkv')

    await Bun.write(embeddedSrtPath, timestampsToSrt(shiftedSubtitle))

    await new FFmpegBuilder({ overwrite: true })
      .rawInput('-f', 'lavfi')
      .input(`color=c=black:s=320x240:d=${videoDuration}:r=24`)
      .rawInput('-f', 'lavfi')
      .input('anullsrc=r=48000:cl=stereo')
      .input(embeddedSrtPath)
      .duration(videoDuration)
      .codec('v', 'libx264')
      .preset('ultrafast')
      .codec('a', 'aac')
      .codec('s', 'subrip')
      .output(embeddedMkvPath)
      .run()

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'video_hash',
      embeddedMkvPath,
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 320,
          height: 240,
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
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: false,
          language: 'por',
        },
      ],
      { duration: videoDuration }
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'audio_hash',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          language: 'eng',
        },
      ],
      { duration: videoDuration }
    )

    const videoTracks = await DbMediaTracks.getByMediaFileId(videoFile.id)
    const audioTracks = await DbMediaTracks.getByMediaFileId(audioFile.id)
    const videoAudio = videoTracks.find((t) => t.stream_type === 'audio')!
    const videoSubtitle = videoTracks.find((t) => t.stream_type === 'subtitle')!
    const externalAudio = audioTracks.find((t) => t.stream_type === 'audio')!

    await seedVadTimestamps(videoAudio.id, base)
    await seedVadTimestamps(externalAudio.id, denseTimestamps(24, 999))

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoTracks.find((t) => t.stream_type === 'video')!.id,
      audio: externalAudio.id,
      sub: videoSubtitle.id,
    })
    const { subtitleSync: offset } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: resolved.subtitle,
    })

    expect(offset.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
    expect(Math.abs(offset.offset)).toBeGreaterThan(0.2)
  })

  test('different download_id with missing vad → offset is 0', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'video_hash',
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

    const { file: subFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'sub_hash',
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

    const videoTracks = await DbMediaTracks.getByMediaFileId(videoFile.id)
    const subTracks = await DbMediaTracks.getByMediaFileId(subFile.id)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoTracks.find((t) => t.stream_type === 'video')!.id,
      audio: videoTracks.find((t) => t.stream_type === 'audio')!.id,
      sub: subTracks.find((t) => t.stream_type === 'subtitle')!.id,
    })
    const { subtitleSync: offset } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: resolved.subtitle,
    })

    expect(offset).toEqual({ offset: 0, confidence: null, speed: 1 })
  })

  test('different download_id with vad → attempts correlation', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'video_hash',
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

    await TestSeed.player.vad(videoFile.id, 42)

    const { file: subFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'sub_hash',
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

    const videoTracks = await DbMediaTracks.getByMediaFileId(videoFile.id)
    const subTracks = await DbMediaTracks.getByMediaFileId(subFile.id)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoTracks.find((t) => t.stream_type === 'video')!.id,
      audio: videoTracks.find((t) => t.stream_type === 'audio')!.id,
      sub: subTracks.find((t) => t.stream_type === 'subtitle')!.id,
    })
    const { subtitleSync: offset } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: resolved.subtitle,
    })

    expect(offset.offset).toBeTypeOf('number')
    expect(offset.confidence).toBeTypeOf('number')
    expect(offset.confidence).toBeGreaterThanOrEqual(0)
  })

  test('different download_id subtitle uses the video timeline when video has reference audio', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })
    const base = denseTimestamps(200, 42)
    const garbage = denseTimestamps(200, 999)
    const matchedSubtitlePath = join(tmpDir, 'video-owned-match.srt')

    await Bun.write(matchedSubtitlePath, timestampsToSrt(base))

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'video_hash',
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
      ],
      { duration: base.at(-1)! }
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'audio_hash',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ],
      { duration: base.at(-1)! }
    )

    const { file: subFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'sub_hash',
      matchedSubtitlePath,
      [
        {
          stream_index: 0,
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: false,
        },
      ]
    )

    const videoTracks = await DbMediaTracks.getByMediaFileId(videoFile.id)
    const audioTracks = await DbMediaTracks.getByMediaFileId(audioFile.id)
    const subTracks = await DbMediaTracks.getByMediaFileId(subFile.id)
    const referenceAudio = videoTracks.find((t) => t.stream_type === 'audio')!
    const externalAudio = audioTracks.find((t) => t.stream_type === 'audio')!

    await seedVadTimestamps(referenceAudio.id, base)
    await seedVadTimestamps(externalAudio.id, garbage)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoTracks.find((t) => t.stream_type === 'video')!.id,
      audio: externalAudio.id,
      sub: subTracks.find((t) => t.stream_type === 'subtitle')!.id,
    })
    const { subtitleSync: offset } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: resolved.subtitle,
    })

    expect(offset.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('separate audio file → uses audio file vad for correlation', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'video_hash',
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
      ]
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'audio_hash',
      '/movies/movie.audio.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ]
    )

    await TestSeed.player.vad(audioFile.id, 99)

    const { file: subFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'sub_hash',
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

    const videoTracks = await DbMediaTracks.getByMediaFileId(videoFile.id)
    const audioTracks = await DbMediaTracks.getByMediaFileId(audioFile.id)
    const subTracks = await DbMediaTracks.getByMediaFileId(subFile.id)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoTracks.find((t) => t.stream_type === 'video')!.id,
      audio: audioTracks.find((t) => t.stream_type === 'audio')!.id,
      sub: subTracks.find((t) => t.stream_type === 'subtitle')!.id,
    })

    expect(resolved.video.file_id).toBe(videoFile.id)
    expect(resolved.audio.file_id).toBe(audioFile.id)
    expect(resolved.video.file_id).not.toBe(resolved.audio.file_id)

    const { subtitleSync: offset } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: resolved.subtitle,
    })

    expect(offset.offset).toBeTypeOf('number')
    expect(offset.confidence).toBeTypeOf('number')
    expect(offset.confidence).toBeGreaterThanOrEqual(0)
  })

  test('combined-offset path: subtitle matching external audio resolves offset via audio-sync correction', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })
    const base = denseTimestamps(200, 42)
    const shift = 3.0
    const shiftedBase = shiftTimestamps(base, shift)
    const duration = base.at(-1)!
    const combinedOffsetSrtPath = join(tmpDir, 'combined-offset-sub.srt')

    await Bun.write(combinedOffsetSrtPath, timestampsToSrt(shiftedBase))

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'video_hash',
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
      ],
      { duration }
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'audio_hash',
      '/tracks/audio.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ],
      { duration }
    )

    const { file: subFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'sub_hash',
      combinedOffsetSrtPath,
      [
        {
          stream_index: 0,
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: false,
        },
      ]
    )

    const videoTracks = await DbMediaTracks.getByMediaFileId(videoFile.id)
    const audioTracks = await DbMediaTracks.getByMediaFileId(audioFile.id)
    const subTracks = await DbMediaTracks.getByMediaFileId(subFile.id)
    const referenceAudio = videoTracks.find((t) => t.stream_type === 'audio')!
    const externalAudio = audioTracks.find((t) => t.stream_type === 'audio')!

    await seedVadTimestamps(referenceAudio.id, base)
    await seedVadTimestamps(externalAudio.id, shiftedBase)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: videoTracks.find((t) => t.stream_type === 'video')!.id,
      audio: externalAudio.id,
      sub: subTracks.find((t) => t.stream_type === 'subtitle')!.id,
    })
    const { subtitleSync: offset } = await player.resolvePlayback({
      video: resolved.video,
      audio: resolved.audio,
      subtitle: resolved.subtitle,
    })

    expect(offset.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
    expect(Math.abs(offset.offset)).toBeGreaterThan(0.5)
  })
})
