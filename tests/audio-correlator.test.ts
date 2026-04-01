import { describe, expect, test } from 'bun:test'

import { AudioCorrelator, MIN_SYNC_CONFIDENCE } from '@/audio-correlator'
import { SILERO_SAMPLE_RATE, SILERO_WINDOW_SAMPLES } from '@/vad-extractor'

const WINDOW_DURATION = SILERO_WINDOW_SAMPLES / SILERO_SAMPLE_RATE

function makeTimestamps(segments: { start: number; end: number }[]) {
  const result = new Float32Array(segments.length * 2)

  for (let i = 0; i < segments.length; i++) {
    result[i * 2] = segments[i]!.start
    result[i * 2 + 1] = segments[i]!.end
  }

  return result
}

function shiftTimestamps(timestamps: Float32Array, shiftSeconds: number) {
  const result = new Float32Array(timestamps.length)

  for (let i = 0; i < timestamps.length; i++) {
    result[i] = timestamps[i]! + shiftSeconds
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
    const a = makeTimestamps([
      { start: 0, end: 1 },
      { start: 10, end: 11 },
    ])
    const b = makeTimestamps([
      { start: 5, end: 6 },
      { start: 15, end: 16 },
    ])

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
