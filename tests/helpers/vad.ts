export function denseTimestamps(count: number, seed: number) {
  const result = new Float32Array(count * 2)
  let state = seed
  let cursor = 0.5

  for (let i = 0; i < count; i++) {
    state = (state * 1664525 + 1013904223) & 0xffffffff
    const gap = 0.3 + ((state >>> 16) / 65536) * 1.5
    cursor += gap

    state = (state * 1664525 + 1013904223) & 0xffffffff
    const duration = 0.5 + ((state >>> 16) / 65536) * 3

    result[i * 2] = cursor
    result[i * 2 + 1] = cursor + duration
    cursor += duration
  }

  return result
}

export function shiftTimestamps(
  timestamps: Float32Array,
  shiftSeconds: number
) {
  const result = new Float32Array(timestamps.length)

  for (let i = 0; i < timestamps.length; i++) {
    result[i] = timestamps[i] + shiftSeconds
  }

  return result
}
