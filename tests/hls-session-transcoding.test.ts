import { describe, expect, test } from 'bun:test'

import { HlsSession } from '@/hls-session'

type SessionOpts = ConstructorParameters<typeof HlsSession>[0]

function argAfter(args: string[], flag: string) {
  const idx = args.indexOf(flag)

  if (idx < 0) {
    return undefined
  }

  return args[idx + 1]
}

function createSession(codecStrategy: SessionOpts['codecStrategy']) {
  return new HlsSession({
    videoFilePath: '/test/video.mkv',
    audioFilePath: '/test/video.mkv',
    videoStreamIndex: 0,
    audioStreamIndex: 1,
    keyframes: [0, 5, 10],
    duration: 15,
    outDir: '/tmp/test-hls',
    codecStrategy,
  })
}

describe('HlsSession — codec strategy FFmpeg args', () => {
  test('both copy → codec copy, no encoding flags, no -hwaccel', () => {
    const session = createSession({
      video: { mode: 'copy' },
      audio: { mode: 'copy' },
    })
    const args = session.buildCommand(0).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('copy')
    expect(args).not.toContain('-hwaccel')
    expect(args).not.toContain('-crf')
    expect(args).not.toContain('-preset')
  })

  test('video transcode + audio copy → libx264 with CRF/preset, -hwaccel auto', () => {
    const session = createSession({
      video: {
        mode: 'transcode',
        codec: 'libx264',
        crf: 21,
        preset: 'veryfast',
      },
      audio: { mode: 'copy' },
    })
    const args = session.buildCommand(0).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('21')
    expect(argAfter(args, '-preset')).toBe('veryfast')
    expect(argAfter(args, '-hwaccel')).toBe('auto')
    expect(argAfter(args, '-c:a')).toBe('copy')
  })

  test('audio transcode + video copy → aac with -ac, no -hwaccel', () => {
    const session = createSession({
      video: { mode: 'copy' },
      audio: { mode: 'transcode', codec: 'aac', channels: 6 },
    })
    const args = session.buildCommand(0).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('6')
    expect(args).not.toContain('-hwaccel')
  })

  test('both transcode → all encoding flags present', () => {
    const session = createSession({
      video: {
        mode: 'transcode',
        codec: 'libx264',
        crf: 18,
        preset: 'medium',
      },
      audio: { mode: 'transcode', codec: 'aac', channels: 8 },
    })
    const args = session.buildCommand(0).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('18')
    expect(argAfter(args, '-preset')).toBe('medium')
    expect(argAfter(args, '-hwaccel')).toBe('auto')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('8')
  })

  test('-hwaccel auto only when video is transcoded', () => {
    const audiOnlyTranscode = createSession({
      video: { mode: 'copy' },
      audio: { mode: 'transcode', codec: 'aac' },
    })

    expect(audiOnlyTranscode.buildCommand(0).toArgs()).not.toContain('-hwaccel')

    const videoTranscode = createSession({
      video: {
        mode: 'transcode',
        codec: 'libx264',
        crf: 21,
        preset: 'veryfast',
      },
      audio: { mode: 'copy' },
    })

    expect(videoTranscode.buildCommand(0).toArgs()).toContain('-hwaccel')
  })

  test('audio transcode without channels omits -ac', () => {
    const session = createSession({
      video: { mode: 'copy' },
      audio: { mode: 'transcode', codec: 'aac' },
    })
    const args = session.buildCommand(0).toArgs()

    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(args).not.toContain('-ac')
  })

  test('-hwaccel auto appears before -i', () => {
    const session = createSession({
      video: {
        mode: 'transcode',
        codec: 'libx264',
        crf: 21,
        preset: 'veryfast',
      },
      audio: { mode: 'copy' },
    })
    const args = session.buildCommand(0).toArgs()

    const hwaccelIdx = args.indexOf('-hwaccel')
    const inputIdx = args.indexOf('-i')

    expect(hwaccelIdx).toBeGreaterThanOrEqual(0)
    expect(hwaccelIdx).toBeLessThan(inputIdx)
  })
})
