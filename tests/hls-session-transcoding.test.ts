import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import * as fsPromises from 'fs/promises'

import { HlsSession } from '@/hls-session'
import { Transcoder } from '@/transcoder'

const originalAccess = fsPromises.access.bind(fsPromises)

function mockVaapiDevice(present: boolean) {
  spyOn(fsPromises, 'access').mockImplementation((path: any) => {
    if (path === '/dev/dri/renderD128') {
      if (present) {
        return Promise.resolve()
      }

      return Promise.reject(new Error('ENOENT'))
    }

    return originalAccess(path)
  })
}

afterEach(() => {
  mock.restore()
})

function argAfter(args: string[], flag: string) {
  const idx = args.indexOf(flag)

  if (idx < 0) {
    return undefined
  }

  return args[idx + 1]
}

async function createSession(tracks: {
  video: { codec_name: string }
  audio: { codec_name: string; channels?: number | null }
}) {
  mockVaapiDevice(false)

  const transcoder = await Transcoder.create(tracks, {
    video_crf: 21,
    video_preset: 'veryfast',
  })

  return new HlsSession({
    videoFilePath: '/test/video.mkv',
    audioFilePath: '/test/video.mkv',
    videoStreamIndex: 0,
    audioStreamIndex: 1,
    keyframes: [0, 5, 10],
    duration: 15,
    outDir: '/tmp/test-hls',
    transcoder,
  })
}

describe('HlsSession — transcoder FFmpeg args', () => {
  test('both copy → codec copy, no encoding flags, no -hwaccel', async () => {
    const session = await createSession({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'aac' },
    })
    const args = session.buildCommand(0).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('copy')
    expect(args).not.toContain('-hwaccel')
    expect(args).not.toContain('-crf')
    expect(args).not.toContain('-preset')
  })

  test('video transcode + audio copy → libx264 with CRF/preset, -hwaccel auto', async () => {
    const session = await createSession({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    })
    const args = session.buildCommand(0).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('21')
    expect(argAfter(args, '-preset')).toBe('veryfast')
    expect(argAfter(args, '-hwaccel')).toBe('auto')
    expect(argAfter(args, '-c:a')).toBe('copy')
  })

  test('audio transcode + video copy → aac with -ac, no -hwaccel', async () => {
    const session = await createSession({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'dts', channels: 6 },
    })
    const args = session.buildCommand(0).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('6')
    expect(args).not.toContain('-hwaccel')
  })

  test('both transcode → all encoding flags present', async () => {
    const session = await createSession({
      video: { codec_name: 'av1' },
      audio: { codec_name: 'dts', channels: 8 },
    })
    const args = session.buildCommand(0).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('21')
    expect(argAfter(args, '-preset')).toBe('veryfast')
    expect(argAfter(args, '-hwaccel')).toBe('auto')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('8')
  })

  test('-hwaccel auto only when video is transcoded', async () => {
    const audioOnly = await createSession({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'dts' },
    })

    expect(audioOnly.buildCommand(0).toArgs()).not.toContain('-hwaccel')

    const videoTranscode = await createSession({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    })

    expect(videoTranscode.buildCommand(0).toArgs()).toContain('-hwaccel')
  })

  test('audio transcode without channels omits -ac', async () => {
    const session = await createSession({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'dts' },
    })
    const args = session.buildCommand(0).toArgs()

    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(args).not.toContain('-ac')
  })

  test('-hwaccel auto appears before -i', async () => {
    const session = await createSession({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    })
    const args = session.buildCommand(0).toArgs()

    const hwaccelIdx = args.indexOf('-hwaccel')
    const inputIdx = args.indexOf('-i')

    expect(hwaccelIdx).toBeGreaterThanOrEqual(0)
    expect(hwaccelIdx).toBeLessThan(inputIdx)
  })
})
