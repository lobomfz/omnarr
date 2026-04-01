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
const refSubsMkv = join(tmpDir, 'ref-subs.mkv')

beforeAll(async () => {
  await MediaFixtures.generateWithSubs(refSubsMkv, tmpDir)
})

beforeEach(() => {
  database.reset()
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('HlsServer — subtitle conversion', () => {
  test('converts subtitle to WebVTT', async () => {
    const filePath = join(tmpDir, 'subs/movie.mkv')

    await MediaFixtures.copy(refSubsMkv, filePath)

    const probe = await new FFmpegBuilder().input(filePath).probe()
    const keyframes = await new FFmpegBuilder().input(filePath).probeKeyframes()
    const duration = probe.format.duration

    const segments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? duration) - pts,
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
          file_path: filePath,
          stream_index: 2,
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
      mediaId: 'SUBSTEST',
    })

    await server.start()

    const vttUrl = server.url.replace('master.m3u8', 'subs.vtt')
    const vttRes = await fetch(vttUrl)

    expect(vttRes.status).toBe(200)

    const content = await vttRes.text()

    expect(content).toContain('WEBVTT')

    await server.stop()
  })

  test('applies subtitleOffset to VTT timestamps', async () => {
    const filePath = join(tmpDir, 'subs-offset/movie.mkv')

    await MediaFixtures.copy(refSubsMkv, filePath)

    const probe = await new FFmpegBuilder().input(filePath).probe()
    const keyframes = await new FFmpegBuilder().input(filePath).probeKeyframes()
    const duration = probe.format.duration

    const segments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? duration) - pts,
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
          file_path: filePath,
          stream_index: 2,
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
      subtitleOffset: 2,
      port: 0,
      mediaId: 'SUBOFF',
    })

    await server.start()

    const vttUrl = server.url.replace('master.m3u8', 'subs.vtt')
    const content = await (await fetch(vttUrl)).text()

    expect(content).toContain('00:02.000')

    await server.stop()
  })
})
