import { describe, expect, test } from 'bun:test'

import { WindowedCorrelator } from '@/audio/windowed-correlator'

function createSegments(
  startSeconds: number,
  shiftSeconds: number,
  count: number,
  gapSeconds: number
) {
  const segments: { start: number; end: number }[] = []
  let cursor = startSeconds + 5

  for (let i = 0; i < count; i++) {
    segments.push({
      start: cursor + shiftSeconds,
      end: cursor + shiftSeconds + 2,
    })

    cursor += gapSeconds
  }

  return segments
}

function timestamps(segments: { start: number; end: number }[]) {
  const result = new Float32Array(segments.length * 2)

  for (let i = 0; i < segments.length; i++) {
    result[i * 2] = segments[i].start
    result[i * 2 + 1] = segments[i].end
  }

  return result
}

describe('WindowedCorrelator', () => {
  test('measures the planted offset independently for each requested range', () => {
    const reference = timestamps([
      ...createSegments(0, 0, 18, 12),
      ...createSegments(600, 0, 18, 12),
      ...createSegments(1200, 0, 18, 12),
    ])
    const target = timestamps([
      ...createSegments(0, 0.2, 18, 12),
      ...createSegments(600, 0.5, 18, 12),
      ...createSegments(1200, 0.8, 18, 12),
    ])

    const result = WindowedCorrelator.correlate({
      reference,
      target,
      ranges: [
        { label: 'start', startSeconds: 0, endSeconds: 300 },
        { label: 'middle', startSeconds: 600, endSeconds: 900 },
        { label: 'end', startSeconds: 1200, endSeconds: 1500 },
      ],
    })

    expect(result).toHaveLength(3)
    expect(result[0]?.label).toBe('start')
    expect(result[0]?.offsetSeconds).toBeCloseTo(-0.2, 1)
    expect(result[1]?.offsetSeconds).toBeCloseTo(-0.5, 1)
    expect(result[2]?.offsetSeconds).toBeCloseTo(-0.8, 1)
    expect(result.every((window) => window.topPeaks.length === 5)).toBe(true)
  })

  test('returns zero-confidence output for a range with no speech on either side', () => {
    const result = WindowedCorrelator.correlate({
      reference: new Float32Array(0),
      target: new Float32Array(0),
      ranges: [{ label: 'empty', startSeconds: 0, endSeconds: 300 }],
    })

    expect(result).toEqual([
      {
        label: 'empty',
        startSeconds: 0,
        endSeconds: 300,
        offsetSeconds: 0,
        confidence: 0,
        topPeaks: [],
      },
    ])
  })
})
