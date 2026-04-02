import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'
import { InferenceSession, Tensor } from 'onnxruntime-node'

import { SILERO_SAMPLE_RATE, SILERO_WINDOW_SAMPLES } from '@/audio/vad-constants'

export { SILERO_SAMPLE_RATE, SILERO_WINDOW_SAMPLES }

const CONTEXT_SIZE = 64
const THRESHOLD = 0.5
const NEG_THRESHOLD = 0.35
const MIN_SPEECH_SAMPLES = (SILERO_SAMPLE_RATE * 250) / 1000
const MIN_SILENCE_SAMPLES = (SILERO_SAMPLE_RATE * 100) / 1000
const SPEECH_PAD_SAMPLES = (SILERO_SAMPLE_RATE * 30) / 1000
const WINDOW_BYTES = SILERO_WINDOW_SAMPLES * Float32Array.BYTES_PER_ELEMENT

const MODEL_PATH = join(import.meta.dir, 'models', 'silero_vad.onnx')

const session = await InferenceSession.create(MODEL_PATH, {
  intraOpNumThreads: 4,
  interOpNumThreads: 1,
  executionMode: 'sequential',
  graphOptimizationLevel: 'all',
})

const srTensor = new Tensor(
  'int64',
  BigInt64Array.from([BigInt(SILERO_SAMPLE_RATE)])
)

export class VadExtractor {
  private state = new Float32Array(2 * 1 * 128)
  private context = new Float32Array(CONTEXT_SIZE)
  private inputWithContext = new Float32Array(
    CONTEXT_SIZE + SILERO_WINDOW_SAMPLES
  )

  private triggered = false
  private tempEnd = 0
  private currentSpeech: { start?: number; end?: number } = {}
  private speeches: { start: number; end: number }[] = []

  private async processChunk(chunk: Float32Array) {
    this.inputWithContext.set(this.context, 0)
    this.inputWithContext.set(chunk, CONTEXT_SIZE)

    const feeds = {
      input: new Tensor('float32', this.inputWithContext, [
        1,
        this.inputWithContext.length,
      ]),
      state: new Tensor('float32', this.state, [2, 1, 128]),
      sr: srTensor,
    }

    const results = await session.run(feeds)
    const outputNames = session.outputNames

    this.state.set(results[outputNames[1]!]!.data as Float32Array)
    this.context.set(
      this.inputWithContext.subarray(
        this.inputWithContext.length - CONTEXT_SIZE
      )
    )

    return (results[outputNames[0]!]!.data as Float32Array)[0]!
  }

  private async processFrame(frame: Float32Array, curSample: number) {
    const speechProb = await this.processChunk(frame)

    if (speechProb >= THRESHOLD && this.tempEnd) {
      this.tempEnd = 0
    }

    if (speechProb >= THRESHOLD && !this.triggered) {
      this.triggered = true
      this.currentSpeech.start = curSample
      return
    }

    if (speechProb < NEG_THRESHOLD && this.triggered) {
      if (!this.tempEnd) {
        this.tempEnd = curSample
      }

      if (curSample - this.tempEnd < MIN_SILENCE_SAMPLES) {
        return
      }

      this.currentSpeech.end = this.tempEnd

      if (
        this.currentSpeech.end! - this.currentSpeech.start! >=
        MIN_SPEECH_SAMPLES
      ) {
        this.speeches.push({
          start: this.currentSpeech.start!,
          end: this.currentSpeech.end!,
        })
      }

      this.currentSpeech = {}
      this.triggered = false
      this.tempEnd = 0
    }
  }

  private padSpeeches(totalSamples: number) {
    for (let i = 0; i < this.speeches.length; i++) {
      const speech = this.speeches[i]!
      const prevEnd = i === 0 ? 0 : this.speeches[i - 1]!.end
      const nextStart =
        i === this.speeches.length - 1
          ? totalSamples
          : this.speeches[i + 1]!.start

      speech.start = Math.max(
        0,
        Math.floor(Math.max(speech.start - SPEECH_PAD_SAMPLES, prevEnd))
      )
      speech.end = Math.min(
        totalSamples,
        Math.floor(Math.min(speech.end + SPEECH_PAD_SAMPLES, nextStart))
      )
    }
  }

  private toTimestamps() {
    const result = new Float32Array(this.speeches.length * 2)

    for (let i = 0; i < this.speeches.length; i++) {
      result[i * 2] = this.speeches[i]!.start / SILERO_SAMPLE_RATE
      result[i * 2 + 1] = this.speeches[i]!.end / SILERO_SAMPLE_RATE
    }

    return result
  }

  private async processPcmStream(
    path: string,
    onProgress: (ratio: number) => void,
    opts?: { duration?: number }
  ) {
    let processedSamples = 0

    const totalExpectedSamples = opts?.duration
      ? opts.duration * SILERO_SAMPLE_RATE
      : 0

    const stream = new FFmpegBuilder()
      .input(path)
      .map('0:a:0')
      .raw('-ac', '1', '-ar', String(SILERO_SAMPLE_RATE))
      .format('f32le')
      .pipe()

    let pending = new Uint8Array(0)
    let totalBytes = 0

    for await (const chunk of stream) {
      totalBytes += chunk.length

      const merged = new Uint8Array(pending.length + chunk.length)
      merged.set(pending)
      merged.set(chunk, pending.length)

      let offset = 0

      while (offset + WINDOW_BYTES <= merged.length) {
        const window = merged.slice(offset, offset + WINDOW_BYTES)
        const samples = new Float32Array(window.buffer)

        await this.processFrame(samples, processedSamples)
        processedSamples += SILERO_WINDOW_SAMPLES
        offset += WINDOW_BYTES
      }

      pending = merged.slice(offset)

      if (totalExpectedSamples > 0) {
        onProgress(Math.min(processedSamples / totalExpectedSamples, 1))
      }
    }

    const totalSamples = Math.floor(totalBytes / Float32Array.BYTES_PER_ELEMENT)

    const remainingFloats = Math.floor(
      pending.length / Float32Array.BYTES_PER_ELEMENT
    )

    if (remainingFloats > 0) {
      const padded = new Float32Array(SILERO_WINDOW_SAMPLES)
      const remaining = new Float32Array(
        pending.buffer,
        pending.byteOffset,
        remainingFloats
      )
      padded.set(remaining)

      await this.processFrame(padded, processedSamples)
    }

    return totalSamples
  }

  private closeOpenSegment(totalSamples: number) {
    if (this.currentSpeech.start === undefined) {
      return
    }

    this.currentSpeech.end = totalSamples

    if (
      this.currentSpeech.end - this.currentSpeech.start >=
      MIN_SPEECH_SAMPLES
    ) {
      this.speeches.push({
        start: this.currentSpeech.start,
        end: this.currentSpeech.end,
      })
    }
  }

  async extract(
    path: string,
    onProgress: (ratio: number) => void,
    opts?: { duration?: number }
  ) {
    const totalSamples = await this.processPcmStream(path, onProgress, opts)

    this.closeOpenSegment(totalSamples)
    this.padSpeeches(totalSamples)

    return this.toTimestamps()
  }
}
