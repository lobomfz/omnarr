import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import {
  EnvelopeExtractor,
  ENVELOPE_SAMPLE_RATE,
  ENVELOPE_WINDOW_SIZE,
} from '@/envelope-extractor'

const tmpDir = join(tmpdir(), 'omnarr-envelope-test-' + Date.now())
const toneFile = join(tmpDir, 'tone.mkv')
const silentFile = join(tmpDir, 'silent.mkv')

const TONE_DURATION = 2
const SILENT_DURATION = 1
const WINDOW_MS = (ENVELOPE_WINDOW_SIZE / ENVELOPE_SAMPLE_RATE) * 1000

beforeAll(async () => {
  await mkdir(tmpDir, { recursive: true })

  await new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input('sine=frequency=440:duration=' + TONE_DURATION)
    .codec('a', 'aac')
    .output(toneFile)
    .run()

  await new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input('anullsrc=r=48000:cl=mono')
    .duration(SILENT_DURATION)
    .codec('a', 'aac')
    .output(silentFile)
    .run()
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('EnvelopeExtractor.extract', () => {
  test('envelope length matches expected duration at 50ms resolution', async () => {
    const envelope = await EnvelopeExtractor.extract(toneFile, () => {})

    const expectedWindows = Math.floor((TONE_DURATION * 1000) / WINDOW_MS)

    expect(envelope.length).toBeGreaterThanOrEqual(expectedWindows - 2)
    expect(envelope.length).toBeLessThanOrEqual(expectedWindows + 2)
  })

  test('quantized output is within Int8 range', async () => {
    const envelope = await EnvelopeExtractor.extract(toneFile, () => {})

    for (let i = 0; i < envelope.length; i++) {
      expect(envelope[i]).toBeGreaterThanOrEqual(-128)
      expect(envelope[i]).toBeLessThanOrEqual(127)
    }
  })

  test('tone audio produces non-zero envelope values', async () => {
    const envelope = await EnvelopeExtractor.extract(toneFile, () => {})

    const nonZero = envelope.filter((v) => v !== 0).length

    expect(nonZero).toBeGreaterThan(0)
  })

  test('silent audio produces near-zero envelope values', async () => {
    const envelope = await EnvelopeExtractor.extract(silentFile, () => {})

    for (let i = 0; i < envelope.length; i++) {
      expect(Math.abs(envelope[i]!)).toBeLessThanOrEqual(1)
    }
  })

  test('returns Int8Array', async () => {
    const envelope = await EnvelopeExtractor.extract(toneFile, () => {})

    expect(envelope).toBeInstanceOf(Int8Array)
  })
})
