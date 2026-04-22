import { describe, expect, test } from 'bun:test'

import { AudioCorrelator, MIN_SYNC_CONFIDENCE } from '@/audio/audio-correlator'
import {
  SILERO_SAMPLE_RATE,
  SILERO_WINDOW_SAMPLES,
} from '@/audio/vad-extractor'

import { shiftTimestamps } from './helpers/vad'

const WINDOW_DURATION = SILERO_WINDOW_SAMPLES / SILERO_SAMPLE_RATE

function makeTimestamps(segments: { start: number; end: number }[]) {
  const result = new Float32Array(segments.length * 2)

  for (let i = 0; i < segments.length; i++) {
    result[i * 2] = segments[i].start
    result[i * 2 + 1] = segments[i].end
  }

  return result
}

function generateDenseSegments(count: number, seed: number) {
  const segments: { start: number; end: number }[] = []
  let state = seed
  let cursor = 0.5

  for (let i = 0; i < count; i++) {
    state = (state * 1664525 + 1013904223) & 0xffffffff
    const gap = 0.3 + ((state >>> 16) / 65536) * 1.5
    cursor += gap

    state = (state * 1664525 + 1013904223) & 0xffffffff
    const duration = 0.5 + ((state >>> 16) / 65536) * 3

    segments.push({ start: cursor, end: cursor + duration })
    cursor += duration
  }

  return segments
}

describe('AudioCorrelator.correlateTimestamps — synthetic', () => {
  const segments = generateDenseSegments(50, 42)
  const base = makeTimestamps(segments)

  test('returns the top 5 peaks ordered by confidence with the winning peak first', () => {
    const shifted = shiftTimestamps(base, 3)

    const result = AudioCorrelator.correlateTimestamps(base, shifted)

    expect(result.topPeaks).toHaveLength(5)
    expect(result.topPeaks[0]?.offsetSeconds).toBe(result.offsetSeconds)
    expect(result.topPeaks[0]?.confidence).toBe(result.confidence)
    expect(
      result.topPeaks.every((peak, index, peaks) => {
        const previous = peaks[index - 1]

        return index === 0 || previous.confidence >= peak.confidence
      })
    ).toBe(true)
  })

  test('identical timestamps → offset ~0 with high confidence', () => {
    const result = AudioCorrelator.correlateTimestamps(base, base)

    expect(Math.abs(result.offsetSeconds)).toBeLessThanOrEqual(WINDOW_DURATION)
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('known positive shift → detects correct offset', () => {
    const shiftSeconds = 3.0
    const shifted = shiftTimestamps(base, shiftSeconds)

    const result = AudioCorrelator.correlateTimestamps(base, shifted)

    expect(Math.abs(result.offsetSeconds - -shiftSeconds)).toBeLessThanOrEqual(
      0.1
    )
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('known negative shift → detects correct offset', () => {
    const shiftSeconds = 2.0
    const shifted = shiftTimestamps(base, shiftSeconds)

    const result = AudioCorrelator.correlateTimestamps(shifted, base)

    expect(Math.abs(result.offsetSeconds - shiftSeconds)).toBeLessThanOrEqual(
      0.1
    )
  })

  test('completely disjoint timestamps → low confidence', () => {
    const a = makeTimestamps([{ start: 0, end: 1 }])
    const b = makeTimestamps([{ start: 5, end: 6 }])

    const result = AudioCorrelator.correlateTimestamps(a, b)

    expect(result.confidence).toBeLessThan(MIN_SYNC_CONFIDENCE)
  })

  test('empty timestamps → offset 0, confidence 0', () => {
    const empty = new Float32Array(0)

    const result = AudioCorrelator.correlateTimestamps(empty, empty)

    expect(result.offsetSeconds).toBe(0)
    expect(result.confidence).toBe(0)
  })
})

describe('AudioCorrelator.correlateTimestamps — speed-scaled VAD', () => {
  const dense = generateDenseSegments(200, 42)
  const base = makeTimestamps(dense)

  function scaleTimestamps(timestamps: Float32Array, factor: number) {
    const result = new Float32Array(timestamps.length)

    for (let i = 0; i < timestamps.length; i++) {
      result[i] = timestamps[i] * factor
    }

    return result
  }

  test('stretched VAD, rescaled back to base timebase → low residual offset, high confidence', () => {
    const stretchFactor = 1.0448
    const stretched = scaleTimestamps(base, stretchFactor)
    const rescaled = scaleTimestamps(stretched, 1 / stretchFactor)

    const result = AudioCorrelator.correlateTimestamps(base, rescaled)

    expect(Math.abs(result.offsetSeconds)).toBeLessThanOrEqual(
      WINDOW_DURATION * 2
    )
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('stretched and shifted VAD, rescaled back → recovers the residual shift', () => {
    const stretchFactor = 1.0448
    const shiftSeconds = 1.15

    const shifted = shiftTimestamps(base, shiftSeconds)
    const stretched = scaleTimestamps(shifted, stretchFactor)
    const rescaled = scaleTimestamps(stretched, 1 / stretchFactor)

    const result = AudioCorrelator.correlateTimestamps(base, rescaled)

    expect(Math.abs(result.offsetSeconds - -shiftSeconds)).toBeLessThanOrEqual(
      0.2
    )
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })

  test('compressed VAD (speed < 1), rescaled back → low residual offset, high confidence', () => {
    const compressFactor = 0.96
    const compressed = scaleTimestamps(base, compressFactor)
    const rescaled = scaleTimestamps(compressed, 1 / compressFactor)

    const result = AudioCorrelator.correlateTimestamps(base, rescaled)

    expect(Math.abs(result.offsetSeconds)).toBeLessThanOrEqual(
      WINDOW_DURATION * 2
    )
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_SYNC_CONFIDENCE)
  })
})

describe('AudioCorrelator.correlateTimestamps — topPeaks lag axis', () => {
  test('peaks span both negative and positive lags without wrapping artifacts', () => {
    const segments = generateDenseSegments(80, 99)
    const base = makeTimestamps(segments)
    const shifted = shiftTimestamps(base, 4)

    const result = AudioCorrelator.correlateTimestamps(base, shifted)

    expect(result.topPeaks.length).toBeGreaterThan(0)

    const winningPeak = result.topPeaks[0]

    expect(winningPeak.offsetSeconds).toBe(result.offsetSeconds)
    expect(winningPeak.confidence).toBe(result.confidence)

    for (const peak of result.topPeaks) {
      expect(Number.isFinite(peak.offsetSeconds)).toBe(true)
      expect(Number.isFinite(peak.confidence)).toBe(true)
    }
  })
})
