import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import * as fsPromises from 'fs/promises'

import { FFmpegBuilder, type Preset } from '@lobomfz/ffmpeg'

import { Transcoder } from '@/player/transcoder'

const DEFAULT_CONFIG = { video_crf: 21, video_preset: 'veryfast' as const }

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

function applyTranscode(
  tracks: {
    video: { codec_name: string }
    audio: { codec_name: string; channels?: number | null }
  },
  config: { video_crf: number; video_preset: Preset } = DEFAULT_CONFIG
) {
  const transcode = new Transcoder(
    tracks,
    new FFmpegBuilder().input('/test/video.mkv'),
    false
  ).parse(config)

  return transcode
}

describe('Transcoder — codec decisions (CPU)', () => {
  test('no VAAPI device → video transcode uses libx264, crf, preset', () => {
    mockVaapiDevice(false)

    const builder = applyTranscode({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    })
    const args = builder.toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('21')
    expect(argAfter(args, '-preset')).toBe('veryfast')
  })

  test('compatible video codec (h264) → copy', () => {
    mockVaapiDevice(false)

    const builder = applyTranscode({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'aac' },
    })
    const args = builder.toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(args).not.toContain('-crf')
    expect(args).not.toContain('-preset')
  })

  test('compatible audio codecs → copy', () => {
    mockVaapiDevice(false)

    for (const codec of ['aac', 'ac3', 'eac3']) {
      const builder = applyTranscode({
        video: { codec_name: 'h264' },
        audio: { codec_name: codec },
      })
      const args = builder.toArgs()

      expect(argAfter(args, '-c:a')).toBe('copy')
    }
  })

  test('incompatible video codecs → transcode to libx264', () => {
    mockVaapiDevice(false)

    for (const codec of ['hevc', 'av1', 'vp9']) {
      const builder = applyTranscode({
        video: { codec_name: codec },
        audio: { codec_name: 'aac' },
      })
      const args = builder.toArgs()

      expect(argAfter(args, '-c:v')).toBe('libx264')
    }
  })

  test('incompatible audio codecs → transcode to aac', () => {
    mockVaapiDevice(false)

    for (const codec of ['dts', 'flac', 'truehd', 'pcm_s16le', 'opus']) {
      const builder = applyTranscode({
        video: { codec_name: 'h264' },
        audio: { codec_name: codec },
      })
      const args = builder.toArgs()

      expect(argAfter(args, '-c:a')).toBe('aac')
    }
  })
})

describe('Transcoder — four combinations (CPU)', () => {
  test('both copy', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('copy')
    expect(args).not.toContain('-hwaccel')
  })

  test('video transcode + audio copy', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-c:a')).toBe('copy')
    expect(argAfter(args, '-hwaccel')).toBe('auto')
  })

  test('video copy + audio transcode', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'dts', channels: 6 },
    }).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('6')
    expect(args).not.toContain('-hwaccel')
  })

  test('both transcode', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'av1' },
      audio: { codec_name: 'dts', channels: 8 },
    }).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('21')
    expect(argAfter(args, '-preset')).toBe('veryfast')
    expect(argAfter(args, '-hwaccel')).toBe('auto')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('8')
  })
})

describe('Transcoder — config and channels (CPU)', () => {
  test('custom CRF and preset flow into args', () => {
    mockVaapiDevice(false)

    const args = applyTranscode(
      { video: { codec_name: 'hevc' }, audio: { codec_name: 'aac' } },
      { video_crf: 18, video_preset: 'medium' }
    ).toArgs()

    expect(argAfter(args, '-crf')).toBe('18')
    expect(argAfter(args, '-preset')).toBe('medium')
  })

  test('multichannel 5.1 preserved via -ac', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'dts', channels: 6 },
    }).toArgs()

    expect(argAfter(args, '-ac')).toBe('6')
  })

  test('multichannel 7.1 preserved via -ac', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'truehd', channels: 8 },
    }).toArgs()

    expect(argAfter(args, '-ac')).toBe('8')
  })

  test('no channels → no -ac flag', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'dts' },
    }).toArgs()

    expect(args).not.toContain('-ac')
  })

  test('null channels treated as absent', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'dts', channels: null },
    }).toArgs()

    expect(args).not.toContain('-ac')
  })
})

describe('Transcoder — hwaccel placement (CPU)', () => {
  test('-hwaccel auto appears before -i when video transcodes', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    const hwaccelIdx = args.indexOf('-hwaccel')
    const inputIdx = args.indexOf('-i')

    expect(hwaccelIdx).toBeGreaterThanOrEqual(0)
    expect(hwaccelIdx).toBeLessThan(inputIdx)
  })

  test('no -hwaccel when both copy', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    expect(args).not.toContain('-hwaccel')
  })

  test('no -hwaccel when only audio transcodes', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'dts' },
    }).toArgs()

    expect(args).not.toContain('-hwaccel')
  })
})

describe('Transcoder — VAAPI hardware encoding', () => {
  function applyVaapi(
    tracks: {
      video: { codec_name: string }
      audio: { codec_name: string; channels?: number | null }
    },
    config: { video_crf: number; video_preset: Preset } = DEFAULT_CONFIG
  ) {
    return new Transcoder(
      tracks,
      new FFmpegBuilder().input('/test/video.mkv'),
      true
    ).parse(config)
  }

  test('VAAPI present + incompatible video → h264_vaapi with hwaccel vaapi', () => {
    const args = applyVaapi({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    expect(argAfter(args, '-c:v')).toBe('h264_vaapi')
    expect(argAfter(args, '-hwaccel')).toBe('vaapi')
    expect(argAfter(args, '-vaapi_device')).toBe('/dev/dri/renderD128')
  })

  test('VAAPI present + incompatible video → -qp quality', () => {
    const args = applyVaapi({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    expect(argAfter(args, '-qp')).toBe('21')
  })

  test('VAAPI present + incompatible video → no -preset', () => {
    const args = applyVaapi({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    expect(args).not.toContain('-preset')
  })

  test('VAAPI present + incompatible video → no -crf', () => {
    const args = applyVaapi({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    expect(args).not.toContain('-crf')
  })

  test('VAAPI present + compatible video (h264) → copy', () => {
    const args = applyVaapi({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(args).not.toContain('-hwaccel')
  })

  test('VAAPI present + incompatible audio → still aac on CPU', () => {
    const args = applyVaapi({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'dts', channels: 6 },
    }).toArgs()

    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('6')
  })

  test('VAAPI absent + incompatible video → libx264 CPU path', () => {
    mockVaapiDevice(false)

    const args = applyTranscode({
      video: { codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('21')
    expect(argAfter(args, '-preset')).toBe('veryfast')
    expect(argAfter(args, '-hwaccel')).toBe('auto')
  })

  test('video_crf flows as -qp value for VAAPI', () => {
    const args = applyVaapi(
      { video: { codec_name: 'av1' }, audio: { codec_name: 'aac' } },
      { video_crf: 18, video_preset: 'medium' }
    ).toArgs()

    expect(argAfter(args, '-qp')).toBe('18')
  })

  test('both copy with VAAPI available → no hwaccel setup', () => {
    const args = applyVaapi({
      video: { codec_name: 'h264' },
      audio: { codec_name: 'aac' },
    }).toArgs()

    expect(args).not.toContain('-hwaccel')
    expect(args).not.toContain('-vaapi_device')
  })
})
