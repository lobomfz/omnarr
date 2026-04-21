import { DbMediaVad } from '@/db/media-vad'

export async function seedVadTimestamps(
  trackId: number,
  timestamps: Float32Array
) {
  const buffer = new ArrayBuffer(timestamps.byteLength)
  new Float32Array(buffer).set(timestamps)

  await DbMediaVad.create({ track_id: trackId, data: new Uint8Array(buffer) })
}

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

function formatSrtTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000)

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

export function timestampsToSrt(timestamps: Float32Array) {
  const lines: string[] = []

  for (let i = 0; i < timestamps.length / 2; i++) {
    const start = timestamps[i * 2]
    const end = timestamps[i * 2 + 1]

    lines.push(
      `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\nLine ${i + 1}\n`
    )
  }

  return lines.join('\n')
}
