export const MIN_SYNC_CONFIDENCE = 15

export const AudioCorrelator = {
  correlate(
    a: Int8Array,
    b: Int8Array,
    sampleRate: number,
    windowSize: number
  ) {
    const windowMs = (windowSize / sampleRate) * 1000

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
    const offsetSeconds = (windowOffset * windowMs) / 1000

    return { offsetSeconds, confidence }
  },
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
