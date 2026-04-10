import {
  describe,
  expect,
  test,
  beforeEach,
  beforeAll,
  afterAll,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { testCommand } from '@bunli/test'
import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { ExportCommand } from '@/commands/export'
import { database } from '@/db/connection'

import { TestSeed } from '../helpers/seed'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-export-cmd-'))
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
})

describe('export command — hardlink', () => {
  test('shows Linked message for hardlink export', async () => {
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

    const outputPath = join(tmpDir, 'cmd-hl.mkv')

    const result = await testCommand(ExportCommand, {
      args: [media.id, outputPath],
      flags: {},
    })

    expect(result.stdout).toContain('Linked:')
  })

  test('JSON output contains path only', async () => {
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

    const outputPath = join(tmpDir, 'cmd-json.mkv')

    const result = await testCommand(ExportCommand, {
      args: [media.id, outputPath],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)

    expect(data).toEqual({ output: outputPath })
  })
})
