import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { AudioCorrelator, MIN_SYNC_CONFIDENCE } from '@/audio-correlator'
import {
  EnvelopeExtractor,
  ENVELOPE_SAMPLE_RATE,
  ENVELOPE_WINDOW_SIZE,
} from '@/envelope-extractor'

const WINDOW_MS = (ENVELOPE_WINDOW_SIZE / ENVELOPE_SAMPLE_RATE) * 1000

function seededRandom(seed: number) {
  let state = seed

  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff
    return (state >>> 16) / 65536
  }
}

function makeEnvelope(length: number, seed: number) {
  const rng = seededRandom(seed)
  const env = new Int8Array(length)

  for (let i = 0; i < length; i++) {
    env[i] = Math.round((rng() - 0.5) * 200)
  }

  return env
}

function delayEnvelope(env: Int8Array, windows: number) {
  const result = new Int8Array(env.length + windows)

  for (let i = 0; i < env.length; i++) {
    result[i + windows] = env[i]!
  }

  return result
}

describe('AudioCorrelator.correlate — synthetic', () => {
  test('identical envelopes with known shift → detects exact offset', () => {
    const shiftWindows = 20
    const env = makeEnvelope(2000, 42)
    const delayed = delayEnvelope(env, shiftWindows)

    const result = AudioCorrelator.correlate(
      env,
      delayed,
      ENVELOPE_SAMPLE_RATE,
      ENVELOPE_WINDOW_SIZE
    )

    const expectedSeconds = -(shiftWindows * WINDOW_MS) / 1000
    const tolerance = WINDOW_MS / 1000

    expect(
      Math.abs(result.offsetSeconds - expectedSeconds)
    ).toBeLessThanOrEqual(tolerance)
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('identical envelopes with no shift → offset is 0', () => {
    const env = makeEnvelope(2000, 42)

    const result = AudioCorrelator.correlate(
      env,
      env,
      ENVELOPE_SAMPLE_RATE,
      ENVELOPE_WINDOW_SIZE
    )

    expect(Math.abs(result.offsetSeconds)).toBeLessThanOrEqual(WINDOW_MS / 1000)
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('negative offset (A delayed) → correctly detected as negative', () => {
    const shiftWindows = 15
    const env = makeEnvelope(2000, 99)
    const delayed = delayEnvelope(env, shiftWindows)

    const result = AudioCorrelator.correlate(
      delayed,
      env,
      ENVELOPE_SAMPLE_RATE,
      ENVELOPE_WINDOW_SIZE
    )

    const expectedSeconds = (shiftWindows * WINDOW_MS) / 1000
    const tolerance = WINDOW_MS / 1000

    expect(result.offsetSeconds).toBeGreaterThan(0)
    expect(
      Math.abs(result.offsetSeconds - expectedSeconds)
    ).toBeLessThanOrEqual(tolerance)
  })

  test('uncorrelated random envelopes → confidence below threshold', () => {
    const a = makeEnvelope(2000, 111)
    const b = makeEnvelope(2000, 222)

    const result = AudioCorrelator.correlate(
      a,
      b,
      ENVELOPE_SAMPLE_RATE,
      ENVELOPE_WINDOW_SIZE
    )

    expect(result.confidence).toBeLessThan(MIN_SYNC_CONFIDENCE)
  })

  test('handles non-power-of-2 input lengths (zero-pads)', () => {
    const shiftWindows = 10
    const env = makeEnvelope(1500, 77)
    const delayed = delayEnvelope(env, shiftWindows)

    const result = AudioCorrelator.correlate(
      env,
      delayed,
      ENVELOPE_SAMPLE_RATE,
      ENVELOPE_WINDOW_SIZE
    )

    const expectedSeconds = -(shiftWindows * WINDOW_MS) / 1000
    const tolerance = WINDOW_MS / 1000

    expect(
      Math.abs(result.offsetSeconds - expectedSeconds)
    ).toBeLessThanOrEqual(tolerance)
  })
})

const tmpDir = join(tmpdir(), 'omnarr-correlator-test-' + Date.now())
const baseFile = join(tmpDir, 'base.mkv')
const shiftedFile = join(tmpDir, 'shifted.mkv')
const SHIFT_SECONDS = 3

beforeAll(async () => {
  await mkdir(tmpDir, { recursive: true })

  await new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input(
      "aevalsrc='sin(440*2*PI*t)*sin(0.5*2*PI*t)+sin(220*2*PI*t)*sin(1.7*2*PI*t)+random(0)*0.3':d=30:s=48000"
    )
    .codec('a', 'aac')
    .output(baseFile)
    .run()

  await new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input(`anullsrc=r=44100:cl=mono`)
    .duration(SHIFT_SECONDS)
    .codec('a', 'aac')
    .output(join(tmpDir, 'silence.mka'))
    .run()

  await new FFmpegBuilder({ overwrite: true })
    .input(join(tmpDir, 'silence.mka'))
    .input(baseFile)
    .raw('-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1')
    .codec('a', 'aac')
    .output(shiftedFile)
    .run()
}, 15_000)

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('AudioCorrelator.correlate — real envelopes', () => {
  test('detects known offset from fixture files within tolerance', async () => {
    const [envA, envB] = await Promise.all([
      EnvelopeExtractor.extract(baseFile, () => {}),
      EnvelopeExtractor.extract(shiftedFile, () => {}),
    ])

    const result = AudioCorrelator.correlate(
      envA,
      envB,
      ENVELOPE_SAMPLE_RATE,
      ENVELOPE_WINDOW_SIZE
    )

    const tolerance = 0.2

    expect(Math.abs(result.offsetSeconds - -SHIFT_SECONDS)).toBeLessThanOrEqual(
      tolerance
    )
    expect(result.confidence).toBeGreaterThan(5)
  })
})
