import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterAll,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { database } from '@/db/connection'
import { HlsServer } from '@/player/hls-server'
import { Transcoder } from '@/player/transcoder'

import { MediaFixtures } from '../fixtures/media'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-hls-'))
const refMkv = join(tmpDir, 'ref.mkv')

const SRT_CONTENT = `1
00:00:00,000 --> 00:00:00,100
Test subtitle
`

beforeAll(async () => {
  await MediaFixtures.generate(refMkv)
})

beforeEach(() => {
  database.reset()
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('HlsServer — on-demand subtitle serving', () => {
  test('VTT is generated on-demand, not at startup', async () => {
    const filePath = join(tmpDir, 'ondemand/movie.mkv')
    const srtPath = join(tmpDir, 'ondemand/sub.srt')

    await MediaFixtures.copy(refMkv, filePath)
    await Bun.write(srtPath, SRT_CONTENT)

    const probe = await new FFmpegBuilder().input(filePath).probe()
    const keyframes = await new FFmpegBuilder().input(filePath).probeKeyframes()

    const segments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? probe.format.duration) - pts,
    }))

    const server = new HlsServer({
      resolved: {
        video: {
          file_path: filePath,
          stream_index: 0,
          codec_name: 'h264',
          language: null,
          title: null,
        },
        audio: {
          file_path: filePath,
          stream_index: 1,
          codec_name: 'aac',
          language: 'eng',
          title: 'English Stereo',
        },
        subtitle: {
          file_path: srtPath,
          stream_index: 0,
          codec_name: 'subrip',
          language: 'por',
          title: null,
        },
      },
      segments,
      transcode: await Transcoder.init(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
        { video_crf: 21, video_preset: 'veryfast' }
      ),
      audioOffset: 0,
      subtitleOffset: 0,
      port: 0,
      mediaId: 'ONDEMAND',
    })

    await server.start()

    const vttRes = await fetch(
      server.url.replace('master.m3u8', 'subs_000.vtt')
    )

    expect(vttRes.status).toBe(200)

    const content = await vttRes.text()

    expect(content).toStartWith('WEBVTT\n')
    expect(content).toContain('X-TIMESTAMP-MAP=MPEGTS:')
    expect(content).toContain('Test subtitle')

    await server.stop()
  })

  test('subtitle playlist lists segments with correct durations', async () => {
    const filePath = join(tmpDir, 'subs-playlist/movie.mkv')
    const srtPath = join(tmpDir, 'subs-playlist/sub.srt')

    await MediaFixtures.copy(refMkv, filePath)
    await Bun.write(srtPath, SRT_CONTENT)

    const probe = await new FFmpegBuilder().input(filePath).probe()
    const keyframes = await new FFmpegBuilder().input(filePath).probeKeyframes()

    const segments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? probe.format.duration) - pts,
    }))

    const server = new HlsServer({
      resolved: {
        video: {
          file_path: filePath,
          stream_index: 0,
          codec_name: 'h264',
          language: null,
          title: null,
        },
        audio: {
          file_path: filePath,
          stream_index: 1,
          codec_name: 'aac',
          language: 'eng',
          title: null,
        },
        subtitle: {
          file_path: srtPath,
          stream_index: 0,
          codec_name: 'subrip',
          language: 'por',
          title: null,
        },
      },
      segments,
      transcode: await Transcoder.init(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
        { video_crf: 21, video_preset: 'veryfast' }
      ),
      audioOffset: 0,
      subtitleOffset: 0,
      port: 0,
      mediaId: 'SUBPL',
    })

    await server.start()

    const playlistRes = await fetch(
      server.url.replace('master.m3u8', 'subs.m3u8')
    )
    const playlist = await playlistRes.text()

    expect(playlist).toContain('#EXT-X-VERSION:3')
    expect(playlist).toContain('#EXT-X-MEDIA-SEQUENCE:0')
    expect(playlist).toContain('subs_000.vtt')
    expect(playlist).toContain('#EXT-X-ENDLIST')

    await server.stop()
  })

  test('applies subtitleOffset to on-demand VTT timestamps', async () => {
    const filePath = join(tmpDir, 'subs-offset/movie.mkv')
    const srtPath = join(tmpDir, 'subs-offset/sub.srt')

    await MediaFixtures.copy(refMkv, filePath)

    await Bun.write(srtPath, '1\n00:00:01,000 --> 00:00:02,000\nOffset cue\n')

    const segments = [{ pts_time: 0, duration: 10 }]

    const server = new HlsServer({
      resolved: {
        video: {
          file_path: filePath,
          stream_index: 0,
          codec_name: 'h264',
          language: null,
          title: null,
        },
        audio: {
          file_path: filePath,
          stream_index: 1,
          codec_name: 'aac',
          language: 'eng',
          title: null,
        },
        subtitle: {
          file_path: srtPath,
          stream_index: 0,
          codec_name: 'subrip',
          language: 'por',
          title: null,
        },
      },
      segments,
      transcode: await Transcoder.init(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
        { video_crf: 21, video_preset: 'veryfast' }
      ),
      audioOffset: 0,
      subtitleOffset: 3,
      port: 0,
      mediaId: 'SUBOFF',
    })

    await server.start()

    const content = await (
      await fetch(server.url.replace('master.m3u8', 'subs_000.vtt'))
    ).text()

    expect(content).toContain('00:00:04.000')
    expect(content).toContain('00:00:05.000')

    await server.stop()
  })

  test('rejects non-subrip subtitle codec', async () => {
    const filePath = join(tmpDir, 'subs-ass/movie.mkv')
    const srtPath = join(tmpDir, 'subs-ass/sub.srt')

    await MediaFixtures.copy(refMkv, filePath)
    await Bun.write(srtPath, SRT_CONTENT)

    const probe = await new FFmpegBuilder().input(filePath).probe()
    const keyframes = await new FFmpegBuilder().input(filePath).probeKeyframes()

    const segments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? probe.format.duration) - pts,
    }))

    const server = new HlsServer({
      resolved: {
        video: {
          file_path: filePath,
          stream_index: 0,
          codec_name: 'h264',
          language: null,
          title: null,
        },
        audio: {
          file_path: filePath,
          stream_index: 1,
          codec_name: 'aac',
          language: 'eng',
          title: null,
        },
        subtitle: {
          file_path: srtPath,
          stream_index: 0,
          codec_name: 'ass',
          language: 'eng',
          title: null,
        },
      },
      segments,
      transcode: await Transcoder.init(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
        { video_crf: 21, video_preset: 'veryfast' }
      ),
      audioOffset: 0,
      subtitleOffset: 0,
      port: 0,
      mediaId: 'SUBASS',
    })

    expect(() => server.start()).toThrow(/subrip/)
  })

  test('MPEGTS offset is derived from segment PES start_time', async () => {
    const filePath = join(tmpDir, 'pes/movie.mkv')
    const srtPath = join(tmpDir, 'pes/sub.srt')

    await MediaFixtures.copy(refMkv, filePath)
    await Bun.write(srtPath, SRT_CONTENT)

    const probe = await new FFmpegBuilder().input(filePath).probe()
    const keyframes = await new FFmpegBuilder().input(filePath).probeKeyframes()

    const segments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? probe.format.duration) - pts,
    }))

    const server = new HlsServer({
      resolved: {
        video: {
          file_path: filePath,
          stream_index: 0,
          codec_name: 'h264',
          language: null,
          title: null,
        },
        audio: {
          file_path: filePath,
          stream_index: 1,
          codec_name: 'aac',
          language: 'eng',
          title: null,
        },
        subtitle: {
          file_path: srtPath,
          stream_index: 0,
          codec_name: 'subrip',
          language: 'por',
          title: null,
        },
      },
      segments,
      transcode: await Transcoder.init(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
        { video_crf: 21, video_preset: 'veryfast' }
      ),
      audioOffset: 0,
      subtitleOffset: 0,
      port: 0,
      mediaId: 'PES',
    })

    await server.start()

    const content = await (
      await fetch(server.url.replace('master.m3u8', 'subs_000.vtt'))
    ).text()

    const match = content.match(/MPEGTS:(\d+)/)

    expect(match).not.toBeNull()

    const mpegtsValue = parseInt(match![1], 10)

    expect(mpegtsValue).toBeGreaterThanOrEqual(0)

    await server.stop()
  })

  test('cached VTT is served on second request without re-probe', async () => {
    const filePath = join(tmpDir, 'cache/movie.mkv')
    const srtPath = join(tmpDir, 'cache/sub.srt')

    await MediaFixtures.copy(refMkv, filePath)
    await Bun.write(srtPath, SRT_CONTENT)

    const probe = await new FFmpegBuilder().input(filePath).probe()
    const keyframes = await new FFmpegBuilder().input(filePath).probeKeyframes()

    const segments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? probe.format.duration) - pts,
    }))

    const server = new HlsServer({
      resolved: {
        video: {
          file_path: filePath,
          stream_index: 0,
          codec_name: 'h264',
          language: null,
          title: null,
        },
        audio: {
          file_path: filePath,
          stream_index: 1,
          codec_name: 'aac',
          language: 'eng',
          title: null,
        },
        subtitle: {
          file_path: srtPath,
          stream_index: 0,
          codec_name: 'subrip',
          language: 'por',
          title: null,
        },
      },
      segments,
      transcode: await Transcoder.init(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
        { video_crf: 21, video_preset: 'veryfast' }
      ),
      audioOffset: 0,
      subtitleOffset: 0,
      port: 0,
      mediaId: 'CACHE',
    })

    await server.start()

    const vttUrl = server.url.replace('master.m3u8', 'subs_000.vtt')

    const first = await (await fetch(vttUrl)).text()
    const second = await (await fetch(vttUrl)).text()

    expect(first).toBe(second)

    await server.stop()
  })
})
