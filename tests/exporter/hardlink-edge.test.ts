import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { Exporter } from '@/core/exporter'
import { database } from '@/db/connection'

import { TestSeed } from '../helpers/seed'

const realFs = require('fs/promises')

let mockDevPath: string | null = null
let mockLinkError: string | null = null

mock.module('fs/promises', () => ({
  ...realFs,
  stat: async (path: string) => {
    const result = await realFs.stat(path)

    if (mockDevPath && path === mockDevPath) {
      return { ...result, dev: result.dev + 999 }
    }

    return result
  },
  link: async (src: string, dest: string) => {
    if (mockLinkError) {
      throw new Error(mockLinkError)
    }

    return await realFs.link(src, dest)
  },
}))

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-hardlink-edge-'))
let refMkv: string

beforeAll(async () => {
  refMkv = join(tmpDir, 'ref.mkv')

  await new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input('color=c=black:s=320x240:d=0.1:r=24')
    .rawInput('-f', 'lavfi')
    .input('anullsrc=r=48000:cl=stereo')
    .duration(0.1)
    .codec('v', 'libx264')
    .preset('ultrafast')
    .codec('a', 'aac')
    .output(refMkv)
    .run()
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

beforeEach(() => {
  database.reset()
  mockDevPath = null
  mockLinkError = null
})

afterEach(() => {
  mockDevPath = null
  mockLinkError = null
})

describe('Exporter — cross-filesystem fallback', () => {
  test('falls back to mux when stat reports different device', async () => {
    const media = await TestSeed.library.matrix()

    await TestSeed.player.downloadWithTracks(media.id, 'hash1', refMkv, [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 320,
        height: 240,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
      },
    ])

    const outputPath = join(tmpDir, 'cross-fs.mkv')

    mockDevPath = dirname(outputPath)

    const exporter = new Exporter({ id: media.id })
    const result = await exporter.export({
      output: outputPath,
    })

    expect(result).toBe('mux')
  })
})

describe('Exporter — hardlink failure', () => {
  test('throws when link fails on same filesystem', async () => {
    const media = await TestSeed.library.matrix()

    await TestSeed.player.downloadWithTracks(media.id, 'hash1', refMkv, [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 320,
        height: 240,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
      },
    ])

    const outputPath = join(tmpDir, 'link-fail.mkv')

    mockLinkError = 'EPERM: operation not permitted, link'

    const exporter = new Exporter({ id: media.id })

     expect(() => exporter.export({ output: outputPath })).toThrow(/EPERM/)
  })
})
