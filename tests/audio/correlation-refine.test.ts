import { describe, expect, test } from 'bun:test'

import { AudioCorrelator } from '@/audio/audio-correlator'
import { buildRefineRanges, refineCorrelation } from '@/audio/correlation-refine'

import { denseTimestamps, shiftTimestamps } from '../helpers/vad'

function scaleTimestamps(timestamps: Float32Array, factor: number) {
  const result = new Float32Array(timestamps.length)

  for (let i = 0; i < timestamps.length; i++) {
    result[i] = timestamps[i] * factor
  }

  return result
}

describe('refineCorrelation', () => {
  test('recovers refined speed and offset from a stretched + shifted target', () => {
    const reference = denseTimestamps(900, 42)
    const trueSpeed = 1.04416
    const trueShiftSeconds = 1.9
    const target = scaleTimestamps(
      shiftTimestamps(reference, trueShiftSeconds),
      trueSpeed
    )
    const initial = AudioCorrelator.correlateTimestamps(
      reference,
      scaleTimestamps(target, 1 / trueSpeed)
    )
    const runtimeSeconds = Math.max(
      reference.at(-1) ?? 0,
      scaleTimestamps(target, 1 / trueSpeed).at(-1) ?? 0
    )

    const refined = refineCorrelation({
      reference,
      target,
      runtimeSeconds,
      speed: trueSpeed,
      confidence: initial.confidence,
      correlate: AudioCorrelator.correlateTimestamps,
    })

    expect(refined).not.toBeNull()
    expect(refined!.speed).toBeCloseTo(trueSpeed, 3)
    expect(refined!.offsetSeconds).toBeCloseTo(-trueShiftSeconds, 1)
  })

  test('returns null when fewer than the minimum required windows pass the confidence floor', () => {
    const reference = denseTimestamps(20, 1)
    const target = denseTimestamps(20, 999)
    const ranges = buildRefineRanges(60)

    expect(ranges.length).toBeGreaterThan(0)

    const refined = refineCorrelation({
      reference,
      target,
      runtimeSeconds: 60,
      speed: 1.04,
      confidence: 0,
      correlate: AudioCorrelator.correlateTimestamps,
    })

    expect(refined).toBeNull()
  })
})
