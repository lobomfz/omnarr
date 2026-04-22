import type { Correlate } from '@/audio/audio-correlator'
import { WindowedCorrelator } from '@/audio/windowed-correlator'
import { Log } from '@/lib/log'

const SPEED_RATIO_THRESHOLD = 0.02
const SPEED_MIN = 0.9
const SPEED_MAX = 1.1
const KNOWN_SPEED_RATIOS = [25 / 23.976, 25 / 24, 23.976 / 25, 24 / 25]
const CORRELATION_REFINE_WINDOW_SECONDS = 180
const CORRELATION_REFINE_STEP_SECONDS = 60
const REFINE_MIN_WINDOW_CONFIDENCE = 10
const REFINE_MIN_WINDOW_COUNT = 5

export const CorrelationRefiner = {
  detectSpeed(
    videoDuration: number | null | undefined,
    audioDuration: number | null | undefined
  ) {
    if (!videoDuration || !audioDuration) {
      return 1
    }

    const ratio = audioDuration / videoDuration

    if (Math.abs(ratio - 1) <= SPEED_RATIO_THRESHOLD) {
      return 1
    }

    if (ratio < SPEED_MIN || ratio > SPEED_MAX) {
      return 1
    }

    return ratio
  },

  scaleTimestamps(timestamps: Float32Array, factor: number) {
    const result = new Float32Array(timestamps.length)

    for (let i = 0; i < timestamps.length; i++) {
      result[i] = timestamps[i] * factor
    }

    return result
  },

  computeRuntimeSeconds(...values: (number | null | undefined)[]) {
    let max = 0

    for (const value of values) {
      if (value != null && value > max) {
        max = value
      }
    }

    return max
  },

  bestCorrelation(
    reference: Float32Array,
    target: Float32Array,
    fileSpeed: number,
    correlate: Correlate
  ) {
    const results = speedCandidates(fileSpeed).map((speed) => {
      const scaled =
        speed === 1
          ? target
          : CorrelationRefiner.scaleTimestamps(target, 1 / speed)

      return { speed, ...correlate(reference, scaled) }
    })

    const candidates = results.sort((a, b) => b.confidence - a.confidence)

    return {
      ...candidates[0],
      candidates,
    }
  },

  buildRanges(runtimeSeconds: number) {
    if (runtimeSeconds <= CORRELATION_REFINE_WINDOW_SECONDS) {
      return [
        {
          label: 'window_0',
          startSeconds: 0,
          endSeconds: runtimeSeconds,
        },
      ]
    }

    const ranges: {
      label: string
      startSeconds: number
      endSeconds: number
    }[] = []
    const maxStart = runtimeSeconds - CORRELATION_REFINE_WINDOW_SECONDS

    for (
      let startSeconds = 0;
      startSeconds <= maxStart;
      startSeconds += CORRELATION_REFINE_STEP_SECONDS
    ) {
      ranges.push({
        label: `window_${ranges.length}`,
        startSeconds,
        endSeconds: startSeconds + CORRELATION_REFINE_WINDOW_SECONDS,
      })
    }

    const lastStart = ranges.at(-1)?.startSeconds ?? 0

    if (maxStart - lastStart >= CORRELATION_REFINE_STEP_SECONDS / 2) {
      ranges.push({
        label: `window_${ranges.length}`,
        startSeconds: maxStart,
        endSeconds: runtimeSeconds,
      })
    }

    return ranges
  },

  refine(input: {
    reference: Float32Array
    target: Float32Array
    runtimeSeconds: number
    speed: number
    confidence: number
    correlate: Correlate
  }) {
    const windows = WindowedCorrelator.correlate({
      reference: input.reference,
      target: CorrelationRefiner.scaleTimestamps(input.target, 1 / input.speed),
      ranges: CorrelationRefiner.buildRanges(input.runtimeSeconds),
      correlate: input.correlate,
    }).filter((window) => window.confidence >= REFINE_MIN_WINDOW_CONFIDENCE)

    if (windows.length < REFINE_MIN_WINDOW_COUNT) {
      return null
    }

    const fit = fitWindowLine(windows)

    if (!fit) {
      return null
    }

    const denominator = 1 + fit.slope

    if (denominator <= 0) {
      Log.warn(
        `CorrelationRefiner.refine skipped: degenerate slope (denominator=${denominator})`
      )

      return null
    }

    const refinedSpeed = input.speed / denominator

    if (refinedSpeed < SPEED_MIN || refinedSpeed > SPEED_MAX) {
      return null
    }

    return {
      speed: refinedSpeed,
      offsetSeconds: fit.intercept,
      confidence: input.confidence,
    }
  },
}

function speedCandidates(fileSpeed: number) {
  if (fileSpeed === 1) {
    return [1]
  }

  return [fileSpeed, ...KNOWN_SPEED_RATIOS]
}

function fitWindowLine(
  windows: {
    startSeconds: number
    endSeconds: number
    offsetSeconds: number
    confidence: number
  }[]
) {
  let weightSum = 0
  let xSum = 0
  let ySum = 0
  let xxSum = 0
  let xySum = 0

  for (const window of windows) {
    const weight = window.confidence
    const center = (window.startSeconds + window.endSeconds) / 2

    weightSum += weight
    xSum += weight * center
    ySum += weight * window.offsetSeconds
    xxSum += weight * center * center
    xySum += weight * center * window.offsetSeconds
  }

  const denominator = weightSum * xxSum - xSum * xSum

  if (weightSum === 0 || denominator === 0) {
    return null
  }

  const slope = (weightSum * xySum - xSum * ySum) / denominator

  return {
    slope,
    intercept: (ySum - slope * xSum) / weightSum,
  }
}
