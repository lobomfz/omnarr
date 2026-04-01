import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { VadExtractor } from '@/vad-extractor'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-vad-'))
const silentMkv = join(tmpDir, 'silent.mkv')
const speechMkv = join(tmpDir, 'speech.mkv')

beforeAll(async () => {
  await mkdir(tmpDir, { recursive: true })

  await new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input('color=c=black:s=320x240:d=2:r=24')
    .rawInput('-f', 'lavfi')
    .input('anullsrc=r=48000:cl=mono')
    .duration(2)
    .codec('v', 'libx264')
    .preset('ultrafast')
    .codec('a', 'aac')
    .output(silentMkv)
    .run()

  await new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input('color=c=black:s=320x240:d=3:r=24')
    .rawInput('-f', 'lavfi')
    .input(
      'sine=frequency=300:duration=3,aformat=sample_fmts=flt:sample_rates=48000:channel_layouts=mono'
    )
    .duration(3)
    .codec('v', 'libx264')
    .preset('ultrafast')
    .codec('a', 'aac')
    .output(speechMkv)
    .run()
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('VadExtractor.extract', () => {
  test('returns Float32Array for silent audio', async () => {
    const result = await new VadExtractor().extract(silentMkv, () => {})

    expect(result).toBeInstanceOf(Float32Array)
    expect(result.length).toBe(0)
  })

  test('timestamps are in ascending order with start < end', async () => {
    const result = await new VadExtractor().extract(speechMkv, () => {})

    expect(result).toBeInstanceOf(Float32Array)

    for (let i = 0; i < result.length; i += 2) {
      expect(result[i]!).toBeLessThan(result[i + 1]!)
    }

    for (let i = 2; i < result.length; i += 2) {
      expect(result[i]!).toBeGreaterThanOrEqual(result[i - 1]!)
    }
  })

  test('calls onProgress during extraction', async () => {
    const ratios: number[] = []

    await new VadExtractor().extract(silentMkv, (r) => ratios.push(r), {
      duration: 2,
    })

    expect(ratios.length).toBeGreaterThan(0)

    for (const r of ratios) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
    }
  })

  test('does not call onProgress when duration is not provided', async () => {
    const ratios: number[] = []

    await new VadExtractor().extract(silentMkv, (r) => ratios.push(r))

    expect(ratios.length).toBe(0)
  })

  test('result length is always even (start/end pairs)', async () => {
    const result = await new VadExtractor().extract(speechMkv, () => {})

    expect(result.length % 2).toBe(0)
  })
})
