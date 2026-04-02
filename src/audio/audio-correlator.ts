import { SILERO_SAMPLE_RATE, SILERO_WINDOW_SAMPLES } from '@/audio/vad-constants'

export const MIN_SYNC_CONFIDENCE = 15

const WINDOW_DURATION = SILERO_WINDOW_SAMPLES / SILERO_SAMPLE_RATE

export const AudioCorrelator = {
  correlateTimestamps(a: Float32Array, b: Float32Array) {
    const maxEnd = Math.max(a.at(-1) ?? 0, b.at(-1) ?? 0)
    const totalWindows = Math.ceil(maxEnd / WINDOW_DURATION)

    const envA = normalize(timestampsToEnvelope(a, totalWindows))
    const envB = normalize(timestampsToEnvelope(b, totalWindows))

    return correlate(envA, envB)
  },

  correlateOnsets(a: Float32Array, b: Float32Array) {
    const maxEnd = Math.max(a.at(-1) ?? 0, b.at(-1) ?? 0)
    const totalWindows = Math.ceil(maxEnd / WINDOW_DURATION)

    const envA = normalize(onsetsToEnvelope(a, totalWindows))
    const envB = normalize(onsetsToEnvelope(b, totalWindows))

    return correlate(envA, envB)
  },
}

function timestampsToEnvelope(timestamps: Float32Array, length: number) {
  const envelope = new Int8Array(length)

  for (let i = 0; i < timestamps.length; i += 2) {
    const startWindow = Math.floor(timestamps[i]! / WINDOW_DURATION)
    const endWindow = Math.ceil(timestamps[i + 1]! / WINDOW_DURATION)

    for (let j = startWindow; j < endWindow && j < length; j++) {
      envelope[j] = 32
    }
  }

  return envelope
}

const ONSET_WINDOWS = 5

function onsetsToEnvelope(timestamps: Float32Array, length: number) {
  const envelope = new Int8Array(length)

  for (let i = 0; i < timestamps.length; i += 2) {
    const start = Math.floor(timestamps[i]! / WINDOW_DURATION)
    const end = Math.min(start + ONSET_WINDOWS, length)

    for (let j = start; j < end; j++) {
      envelope[j] = 32
    }
  }

  return envelope
}

function normalize(envelope: Int8Array) {
  let sum = 0

  for (let i = 0; i < envelope.length; i++) {
    sum += envelope[i]!
  }

  const mean = sum / envelope.length

  let variance = 0

  for (let i = 0; i < envelope.length; i++) {
    const d = envelope[i]! - mean
    variance += d * d
  }

  const std = Math.sqrt(variance / envelope.length)
  const result = new Int8Array(envelope.length)

  if (std === 0) {
    return result
  }

  for (let i = 0; i < envelope.length; i++) {
    result[i] = Math.max(
      -128,
      Math.min(127, Math.round(((envelope[i]! - mean) / std) * 32))
    )
  }

  return result
}

function correlate(a: Int8Array, b: Int8Array) {
  const aFloat = dequantize(a)
  const bFloat = dequantize(b)

  const n = Math.max(aFloat.length, bFloat.length)
  const size = 1 << Math.ceil(Math.log2(n * 2))

  const aReal = new Float64Array(size)
  const aImag = new Float64Array(size)
  const bReal = new Float64Array(size)
  const bImag = new Float64Array(size)

  aReal.set(aFloat)
  bReal.set(bFloat)

  fft(aReal, aImag)
  fft(bReal, bImag)

  for (let i = 0; i < size; i++) {
    const real = aReal[i]! * bReal[i]! + aImag[i]! * bImag[i]!
    const imag = aImag[i]! * bReal[i]! - aReal[i]! * bImag[i]!
    aReal[i] = real
    aImag[i] = imag
  }

  ifft(aReal, aImag)

  let maxVal = -Infinity
  let maxIdx = 0
  let sum = 0

  for (let i = 0; i < aReal.length; i++) {
    sum += Math.abs(aReal[i]!)

    if (aReal[i]! > maxVal) {
      maxVal = aReal[i]!
      maxIdx = i
    }
  }

  const mean = sum / aReal.length
  const confidence = mean > 0 ? maxVal / mean : 0

  const windowOffset = maxIdx > size / 2 ? maxIdx - size : maxIdx
  const offsetSeconds = windowOffset * WINDOW_DURATION

  return { offsetSeconds, confidence }
}

function dequantize(data: Int8Array) {
  const result = new Float64Array(data.length)

  for (let i = 0; i < data.length; i++) {
    result[i] = data[i]! / 32
  }

  return result
}

function fft(real: Float64Array, imag: Float64Array) {
  const n = real.length

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1

    for (; j & bit; bit >>= 1) {
      j ^= bit
    }

    j ^= bit

    if (i < j) {
      ;[real[i], real[j]] = [real[j]!, real[i]!]
      ;[imag[i], imag[j]] = [imag[j]!, imag[i]!]
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (2 * Math.PI) / len
    const wReal = Math.cos(angle)
    const wImag = Math.sin(angle)

    for (let i = 0; i < n; i += len) {
      let curReal = 1
      let curImag = 0
      const half = len / 2

      for (let j = 0; j < half; j++) {
        const uReal = real[i + j]!
        const uImag = imag[i + j]!
        const vReal =
          real[i + j + half]! * curReal - imag[i + j + half]! * curImag
        const vImag =
          real[i + j + half]! * curImag + imag[i + j + half]! * curReal

        real[i + j] = uReal + vReal
        imag[i + j] = uImag + vImag
        real[i + j + half] = uReal - vReal
        imag[i + j + half] = uImag - vImag

        const newCurReal = curReal * wReal - curImag * wImag
        curImag = curReal * wImag + curImag * wReal
        curReal = newCurReal
      }
    }
  }
}

function ifft(real: Float64Array, imag: Float64Array) {
  const n = real.length

  for (let i = 0; i < n; i++) {
    imag[i] = -imag[i]!
  }

  fft(real, imag)

  for (let i = 0; i < n; i++) {
    real[i] = real[i]! / n
    imag[i] = -imag[i]! / n
  }
}
