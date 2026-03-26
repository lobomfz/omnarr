import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import * as fsPromises from 'fs/promises'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { Transcoder } from '@/transcoder'

const DEFAULT_CONFIG = { video_crf: 21, video_preset: 'veryfast' } as const

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

describe('Transcoder.create() — codec decisions (CPU)', () => {
  test('no VAAPI device → video transcode uses libx264, crf, preset', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      { video: { codec_name: 'hevc' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('21')
    expect(argAfter(args, '-preset')).toBe('veryfast')
  })

  test('compatible video codec (h264) → copy', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(args).not.toContain('-crf')
    expect(args).not.toContain('-preset')
  })

  test('compatible audio codecs → copy', async () => {
    mockVaapiDevice(false)

    for (const codec of ['aac', 'ac3', 'eac3']) {
      const t = await Transcoder.create(
        { video: { codec_name: 'h264' }, audio: { codec_name: codec } },
        DEFAULT_CONFIG
      )

      const args = t
        .apply(new FFmpegBuilder().input('/test/video.mkv'))
        .toArgs()

      expect(argAfter(args, '-c:a')).toBe('copy')
    }
  })

  test('incompatible video codecs → transcode to libx264', async () => {
    mockVaapiDevice(false)

    for (const codec of ['hevc', 'av1', 'vp9']) {
      const t = await Transcoder.create(
        { video: { codec_name: codec }, audio: { codec_name: 'aac' } },
        DEFAULT_CONFIG
      )

      const args = t
        .apply(new FFmpegBuilder().input('/test/video.mkv'))
        .toArgs()

      expect(argAfter(args, '-c:v')).toBe('libx264')
    }
  })

  test('incompatible audio codecs → transcode to aac', async () => {
    mockVaapiDevice(false)

    for (const codec of ['dts', 'flac', 'truehd', 'pcm_s16le', 'opus']) {
      const t = await Transcoder.create(
        { video: { codec_name: 'h264' }, audio: { codec_name: codec } },
        DEFAULT_CONFIG
      )

      const args = t
        .apply(new FFmpegBuilder().input('/test/video.mkv'))
        .toArgs()

      expect(argAfter(args, '-c:a')).toBe('aac')
    }
  })
})

describe('Transcoder.create() — four combinations (CPU)', () => {
  test('both copy', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('copy')
    expect(args).not.toContain('-hwaccel')
  })

  test('video transcode + audio copy', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      { video: { codec_name: 'hevc' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-c:a')).toBe('copy')
    expect(argAfter(args, '-hwaccel')).toBe('auto')
  })

  test('video copy + audio transcode', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      {
        video: { codec_name: 'h264' },
        audio: { codec_name: 'dts', channels: 6 },
      },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('6')
    expect(args).not.toContain('-hwaccel')
  })

  test('both transcode', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      {
        video: { codec_name: 'av1' },
        audio: { codec_name: 'dts', channels: 8 },
      },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('21')
    expect(argAfter(args, '-preset')).toBe('veryfast')
    expect(argAfter(args, '-hwaccel')).toBe('auto')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('8')
  })
})

describe('Transcoder — config and channels (CPU)', () => {
  test('custom CRF and preset flow into apply() args', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      { video: { codec_name: 'hevc' }, audio: { codec_name: 'aac' } },
      { video_crf: 18, video_preset: 'medium' }
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-crf')).toBe('18')
    expect(argAfter(args, '-preset')).toBe('medium')
  })

  test('multichannel 5.1 preserved via -ac', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      {
        video: { codec_name: 'h264' },
        audio: { codec_name: 'dts', channels: 6 },
      },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-ac')).toBe('6')
  })

  test('multichannel 7.1 preserved via -ac', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      {
        video: { codec_name: 'h264' },
        audio: { codec_name: 'truehd', channels: 8 },
      },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-ac')).toBe('8')
  })

  test('no channels → no -ac flag', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'dts' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(args).not.toContain('-ac')
  })

  test('null channels treated as absent', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      {
        video: { codec_name: 'h264' },
        audio: { codec_name: 'dts', channels: null },
      },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(args).not.toContain('-ac')
  })
})

describe('Transcoder.apply() — hwaccel placement (CPU)', () => {
  test('-hwaccel auto appears before -i when video transcodes', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      { video: { codec_name: 'hevc' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    const hwaccelIdx = args.indexOf('-hwaccel')
    const inputIdx = args.indexOf('-i')

    expect(hwaccelIdx).toBeGreaterThanOrEqual(0)
    expect(hwaccelIdx).toBeLessThan(inputIdx)
  })

  test('no -hwaccel when both copy', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(args).not.toContain('-hwaccel')
  })

  test('no -hwaccel when only audio transcodes', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'dts' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(args).not.toContain('-hwaccel')
  })
})

describe('Transcoder — VAAPI hardware encoding', () => {
  test('VAAPI present + incompatible video → h264_vaapi with hwaccel vaapi', async () => {
    mockVaapiDevice(true)

    const t = await Transcoder.create(
      { video: { codec_name: 'hevc' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('h264_vaapi')
    expect(argAfter(args, '-hwaccel')).toBe('vaapi')
    expect(argAfter(args, '-vaapi_device')).toBe('/dev/dri/renderD128')
  })

  test('VAAPI present + incompatible video → -qp quality', async () => {
    mockVaapiDevice(true)

    const t = await Transcoder.create(
      { video: { codec_name: 'hevc' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-qp')).toBe('21')
  })

  test('VAAPI present + incompatible video → no -preset', async () => {
    mockVaapiDevice(true)

    const t = await Transcoder.create(
      { video: { codec_name: 'hevc' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(args).not.toContain('-preset')
  })

  test('VAAPI present + incompatible video → no -crf', async () => {
    mockVaapiDevice(true)

    const t = await Transcoder.create(
      { video: { codec_name: 'hevc' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(args).not.toContain('-crf')
  })

  test('VAAPI present + compatible video (h264) → copy', async () => {
    mockVaapiDevice(true)

    const t = await Transcoder.create(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(args).not.toContain('-hwaccel')
  })

  test('VAAPI present + incompatible audio → still aac on CPU', async () => {
    mockVaapiDevice(true)

    const t = await Transcoder.create(
      {
        video: { codec_name: 'h264' },
        audio: { codec_name: 'dts', channels: 6 },
      },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('6')
  })

  test('VAAPI absent + incompatible video → libx264 CPU path', async () => {
    mockVaapiDevice(false)

    const t = await Transcoder.create(
      { video: { codec_name: 'hevc' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('21')
    expect(argAfter(args, '-preset')).toBe('veryfast')
    expect(argAfter(args, '-hwaccel')).toBe('auto')
  })

  test('video_crf flows as -qp value for VAAPI', async () => {
    mockVaapiDevice(true)

    const t = await Transcoder.create(
      { video: { codec_name: 'av1' }, audio: { codec_name: 'aac' } },
      { video_crf: 18, video_preset: 'medium' }
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(argAfter(args, '-qp')).toBe('18')
  })

  test('both copy with VAAPI available → no hwaccel setup', async () => {
    mockVaapiDevice(true)

    const t = await Transcoder.create(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
      DEFAULT_CONFIG
    )

    const args = t.apply(new FFmpegBuilder().input('/test/video.mkv')).toArgs()

    expect(args).not.toContain('-hwaccel')
    expect(args).not.toContain('-vaapi_device')
  })
})
