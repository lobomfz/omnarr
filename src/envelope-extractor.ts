import { FFmpegBuilder } from '@lobomfz/ffmpeg'

export const ENVELOPE_SAMPLE_RATE = 8000
export const ENVELOPE_WINDOW_SIZE = 400

export const EnvelopeExtractor = {
  async extract(
    path: string,
    onProgress: (ratio: number) => void,
    opts?: { size?: number }
  ) {
    const stream = new FFmpegBuilder()
      .input(path)
      .map('0:a:0')
      .raw('-ac', '1', '-ar', String(ENVELOPE_SAMPLE_RATE))
      .format('f32le')
      .pipe()

    const windowBytes = ENVELOPE_WINDOW_SIZE * 4
    const rmsValues: number[] = []
    let pending = new Uint8Array(0)
    let bytesRead = 0

    for await (const chunk of stream) {
      bytesRead += chunk.length

      if (opts?.size && opts.size > 0) {
        onProgress(Math.min(bytesRead / opts.size, 1))
      }

      const merged = new Uint8Array(pending.length + chunk.length)
      merged.set(pending)
      merged.set(chunk, pending.length)

      let offset = 0

      while (offset + windowBytes <= merged.length) {
        const window = merged.slice(offset, offset + windowBytes)
        const samples = new Float32Array(window.buffer)

        let sum = 0

        for (let j = 0; j < ENVELOPE_WINDOW_SIZE; j++) {
          sum += samples[j]! * samples[j]!
        }

        rmsValues.push(Math.sqrt(sum / ENVELOPE_WINDOW_SIZE))
        offset += windowBytes
      }

      pending = merged.slice(offset)
    }

    if (rmsValues.length === 0) {
      return new Int8Array(0)
    }

    let mean = 0

    for (let i = 0; i < rmsValues.length; i++) {
      mean += rmsValues[i]!
    }

    mean /= rmsValues.length

    let variance = 0

    for (let i = 0; i < rmsValues.length; i++) {
      const d = rmsValues[i]! - mean
      variance += d * d
    }

    const std = Math.sqrt(variance / rmsValues.length)
    const result = new Int8Array(rmsValues.length)

    if (std === 0) {
      return result
    }

    for (let i = 0; i < rmsValues.length; i++) {
      const normalized = (rmsValues[i]! - mean) / std
      result[i] = Math.max(-128, Math.min(127, Math.round(normalized * 32)))
    }

    return result
  },
}
