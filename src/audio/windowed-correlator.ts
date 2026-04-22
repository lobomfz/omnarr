import { AudioCorrelator } from '@/audio/audio-correlator'
import type { Correlate } from '@/audio/audio-correlator'

export const WindowedCorrelator = {
  correlate(input: {
    reference: Float32Array
    target: Float32Array
    ranges: {
      label: string
      startSeconds: number
      endSeconds: number
    }[]
    correlate?: Correlate
  }) {
    return input.ranges.map((range) => {
      const reference = sliceTimestamps(
        input.reference,
        range.startSeconds,
        range.endSeconds
      )
      const target = sliceTimestamps(
        input.target,
        range.startSeconds,
        range.endSeconds
      )

      if (reference.length === 0 || target.length === 0) {
        return {
          label: range.label,
          startSeconds: range.startSeconds,
          endSeconds: range.endSeconds,
          offsetSeconds: 0,
          confidence: 0,
          topPeaks: [],
        }
      }

      const result = (input.correlate ?? AudioCorrelator.correlateTimestamps)(
        reference,
        target
      )

      return {
        label: range.label,
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
        offsetSeconds: result.offsetSeconds,
        confidence: result.confidence,
        topPeaks: result.topPeaks,
      }
    })
  },
}

function sliceTimestamps(
  timestamps: Float32Array,
  startSeconds: number,
  endSeconds: number
) {
  const values: number[] = []

  for (let i = 0; i < timestamps.length; i += 2) {
    const start = timestamps[i]
    const end = timestamps[i + 1]

    if (end <= startSeconds || start >= endSeconds) {
      continue
    }

    values.push(
      Math.max(start, startSeconds) - startSeconds,
      Math.min(end, endSeconds) - startSeconds
    )
  }

  return Float32Array.from(values)
}
