import { describe, expect, test } from 'bun:test'

import { CodecStrategy } from '@/codec-strategy'

const DEFAULT_CONFIG = { video_crf: 21, video_preset: 'veryfast' } as const

describe('resolveCodecStrategy', () => {
  describe('both compatible → both copy', () => {
    test('h264 + aac', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
        DEFAULT_CONFIG
      )

      expect(result.video).toEqual({ mode: 'copy' })
      expect(result.audio).toEqual({ mode: 'copy' })
    })

    test('hevc + ac3', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'hevc' }, audio: { codec_name: 'ac3' } },
        DEFAULT_CONFIG
      )

      expect(result.video).toEqual({ mode: 'copy' })
      expect(result.audio).toEqual({ mode: 'copy' })
    })

    test('hevc + eac3', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'hevc' }, audio: { codec_name: 'eac3' } },
        DEFAULT_CONFIG
      )

      expect(result.video).toEqual({ mode: 'copy' })
      expect(result.audio).toEqual({ mode: 'copy' })
    })
  })

  describe('video compatible + audio incompatible → video copy, audio transcode', () => {
    test('h264 + dts', () => {
      const result = CodecStrategy.resolve(
        {
          video: { codec_name: 'h264' },
          audio: { codec_name: 'dts', channels: 6 },
        },
        DEFAULT_CONFIG
      )

      expect(result.video).toEqual({ mode: 'copy' })
      expect(result.audio).toEqual({
        mode: 'transcode',
        codec: 'aac',
        channels: 6,
      })
    })
  })

  describe('video incompatible + audio compatible → video transcode, audio copy', () => {
    test('av1 + aac', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'av1' }, audio: { codec_name: 'aac' } },
        DEFAULT_CONFIG
      )

      expect(result.video).toEqual({
        mode: 'transcode',
        codec: 'libx264',
        crf: 21,
        preset: 'veryfast',
      })
      expect(result.audio).toEqual({ mode: 'copy' })
    })
  })

  describe('both incompatible → both transcode', () => {
    test('av1 + dts', () => {
      const result = CodecStrategy.resolve(
        {
          video: { codec_name: 'av1' },
          audio: { codec_name: 'dts', channels: 6 },
        },
        DEFAULT_CONFIG
      )

      expect(result.video).toEqual({
        mode: 'transcode',
        codec: 'libx264',
        crf: 21,
        preset: 'veryfast',
      })
      expect(result.audio).toEqual({
        mode: 'transcode',
        codec: 'aac',
        channels: 6,
      })
    })
  })

  describe('custom config values flow into video strategy', () => {
    test('custom CRF and preset', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'av1' }, audio: { codec_name: 'aac' } },
        { video_crf: 18, video_preset: 'medium' }
      )

      expect(result.video).toEqual({
        mode: 'transcode',
        codec: 'libx264',
        crf: 18,
        preset: 'medium',
      })
    })
  })

  describe('each incompatible codec triggers transcode', () => {
    test('vp9 video', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'vp9' }, audio: { codec_name: 'aac' } },
        DEFAULT_CONFIG
      )

      expect(result.video.mode).toBe('transcode')
    })

    test('av1 video', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'av1' }, audio: { codec_name: 'aac' } },
        DEFAULT_CONFIG
      )

      expect(result.video.mode).toBe('transcode')
    })

    test('dts audio', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'dts' } },
        DEFAULT_CONFIG
      )

      expect(result.audio.mode).toBe('transcode')
    })

    test('flac audio', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'flac' } },
        DEFAULT_CONFIG
      )

      expect(result.audio.mode).toBe('transcode')
    })

    test('truehd audio', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'truehd' } },
        DEFAULT_CONFIG
      )

      expect(result.audio.mode).toBe('transcode')
    })

    test('pcm_s16le audio', () => {
      const result = CodecStrategy.resolve(
        {
          video: { codec_name: 'h264' },
          audio: { codec_name: 'pcm_s16le' },
        },
        DEFAULT_CONFIG
      )

      expect(result.audio.mode).toBe('transcode')
    })

    test('opus audio', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'opus' } },
        DEFAULT_CONFIG
      )

      expect(result.audio.mode).toBe('transcode')
    })
  })

  describe('audio channel preservation', () => {
    test('5.1 channels preserved in transcode', () => {
      const result = CodecStrategy.resolve(
        {
          video: { codec_name: 'h264' },
          audio: { codec_name: 'dts', channels: 6 },
        },
        DEFAULT_CONFIG
      )

      expect(result.audio).toEqual({
        mode: 'transcode',
        codec: 'aac',
        channels: 6,
      })
    })

    test('7.1 channels preserved in transcode', () => {
      const result = CodecStrategy.resolve(
        {
          video: { codec_name: 'h264' },
          audio: { codec_name: 'truehd', channels: 8 },
        },
        DEFAULT_CONFIG
      )

      expect(result.audio).toEqual({
        mode: 'transcode',
        codec: 'aac',
        channels: 8,
      })
    })

    test('no channels field when not provided', () => {
      const result = CodecStrategy.resolve(
        { video: { codec_name: 'h264' }, audio: { codec_name: 'dts' } },
        DEFAULT_CONFIG
      )

      expect(result.audio).toEqual({ mode: 'transcode', codec: 'aac' })
      expect(result.audio).not.toHaveProperty('channels')
    })

    test('null channels treated as absent', () => {
      const result = CodecStrategy.resolve(
        {
          video: { codec_name: 'h264' },
          audio: { codec_name: 'dts', channels: null },
        },
        DEFAULT_CONFIG
      )

      expect(result.audio).toEqual({ mode: 'transcode', codec: 'aac' })
      expect(result.audio).not.toHaveProperty('channels')
    })
  })
})
