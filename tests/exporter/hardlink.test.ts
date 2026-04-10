import {
  describe,
  expect,
  test,
  beforeEach,
  beforeAll,
  afterAll,
} from 'bun:test'
import { mkdtemp, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { Exporter } from '@/core/exporter'
import { database } from '@/db/connection'

import { TestSeed } from '../helpers/seed'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-hardlink-'))
let refMkv: string
let refAudio: string

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

  refAudio = join(tmpDir, 'ref-audio.mka')

  await new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input('anullsrc=r=48000:cl=stereo')
    .duration(0.1)
    .codec('a', 'aac')
    .output(refAudio)
    .run()
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

beforeEach(() => {
  database.reset()
})

describe('Exporter — hardlink', () => {
  test('creates hardlink when single file and same filesystem', async () => {
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

    const outputPath = join(tmpDir, 'hl-inode.mkv')
    const exporter = new Exporter({ id: media.id })
    const result = await exporter.export({
      output: outputPath,
    })

    expect(result).toBe('hardlink')

    const sourceStat = await stat(refMkv)
    const outputStat = await stat(outputPath)

    expect(outputStat.ino).toBe(sourceStat.ino)
  })

  test('returns mux when multiple files involved', async () => {
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

    await TestSeed.player.downloadWithTracks(media.id, 'hash2', refAudio, [
      {
        stream_index: 0,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: false,
        language: 'por',
      },
    ])

    const outputPath = join(tmpDir, 'mux-ret.mkv')
    const exporter = new Exporter({ id: media.id })
    const result = await exporter.export({
      output: outputPath,
    })

    expect(result).toBe('mux')
  })
})
