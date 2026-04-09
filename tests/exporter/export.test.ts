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

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { PubSub } from '@/api/pubsub'
import { Exporter } from '@/core/exporter'

import { TestSeed } from '../helpers/seed'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-export-'))

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

beforeEach(() => {
  TestSeed.reset()
})

describe('Exporter — command building', () => {
  test('single file produces correct inputs and maps', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          language: 'eng',
        },
      ]
    )

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)
    const args = exporter.buildCommand(resolved, offsets, '/tmp/out.mkv')

    expect(args).toContain('-i')
    expect(args).toContain('/movies/movie.mkv')
    expect(args).toContain('-map')
    expect(args).toContain('0:0')
    expect(args).toContain('0:1')
    expect(args).toContain('/tmp/out.mkv')
  })

  test('different-download file gets -itsoffset before input', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const { file: videoFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/video.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ]
    )

    const { file: audioFile } = await TestSeed.player.downloadWithTracks(
      media.id,
      'hash2',
      '/tracks/audio_pt.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: false,
          language: 'por',
        },
      ]
    )

    await TestSeed.player.vad(videoFile.id, 42)
    await TestSeed.player.vad(audioFile.id, 42)

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = new Map<number, number>([
      [resolved.video.download_id, 0],
      [resolved.audio[1].download_id, 2.5],
    ])

    const args = exporter.buildCommand(resolved, offsets, '/tmp/out.mkv')

    const itsoffsetIdx = args.indexOf('-itsoffset')
    const audioInputIdx = args.indexOf('/tracks/audio_pt.mka')

    expect(itsoffsetIdx).toBeGreaterThan(-1)
    expect(args[itsoffsetIdx + 1]).toBe('2.5')
    expect(audioInputIdx).toBeGreaterThan(itsoffsetIdx)
  })

  test('same-download file gets no -itsoffset', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ]
    )

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)
    const args = exporter.buildCommand(resolved, offsets, '/tmp/out.mkv')

    expect(args).not.toContain('-itsoffset')
  })

  test('codec is -c copy', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ]
    )

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)
    const args = exporter.buildCommand(resolved, offsets, '/tmp/out.mkv')

    const cIdx = args.indexOf('-c')

    expect(cIdx).toBeGreaterThan(-1)
    expect(args[cIdx + 1]).toBe('copy')
  })

  test('stream metadata is set per output stream', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          language: 'eng',
          title: 'English 5.1',
        },
      ]
    )

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)
    const args = exporter.buildCommand(resolved, offsets, '/tmp/out.mkv')

    expect(args).toContain('-metadata:s:1')
    expect(args).toContain('language=eng')
    expect(args).toContain('title=English 5.1')
  })

  test('default disposition is set for is_default tracks', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          language: 'eng',
        },
        {
          stream_index: 2,
          stream_type: 'audio',
          codec_name: 'ac3',
          is_default: false,
          language: 'por',
        },
      ]
    )

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)
    const args = exporter.buildCommand(resolved, offsets, '/tmp/out.mkv')

    expect(args).toContain('-disposition:s:0')
    expect(args).toContain('-disposition:s:1')
    expect(args.indexOf('-disposition:s:2')).toBe(-1)
  })

  test('streams ordered: video then audio then subtitle', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
        {
          stream_index: 2,
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: false,
          language: 'eng',
        },
      ]
    )

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)
    const args = exporter.buildCommand(resolved, offsets, '/tmp/out.mkv')

    const maps = args
      .map((a, i) => (a === '-map' ? args[i + 1] : null))
      .filter(Boolean)

    expect(maps[0]).toBe('0:0')
    expect(maps[1]).toBe('0:1')
    expect(maps[2]).toBe('0:2')
  })
})

describe('Exporter — output validation', () => {
  test('throws when output file already exists', async () => {
    const existingFile = join(tmpDir, 'existing.mkv')

    await Bun.write(existingFile, 'dummy')

    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    await TestSeed.player.downloadWithTracks(
      media.id,
      'hash1',
      '/movies/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ]
    )

    const exporter = new Exporter({ id: media.id })

    await expect(() => exporter.export({ output: existingFile })).toThrow(
      /already exists/i
    )
  })
})

describe('Exporter — integration', () => {
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
      .raw('-metadata:s:a:0', 'language=eng')
      .raw('-metadata:s:a:0', 'title=English Stereo')
      .output(refMkv)
      .run()
  })

  test('produces a valid MKV with all expected streams', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

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
        language: 'eng',
        title: 'English Stereo',
      },
    ])

    const outputPath = join(tmpDir, 'export-test.mkv')
    const exporter = new Exporter({ id: media.id })

    await exporter.export({ output: outputPath })

    const probe = await new FFmpegBuilder().input(outputPath).probe()

    expect(probe.streams).toHaveLength(2)
    expect(probe.streams[0].codec_type).toBe('video')
    expect(probe.streams[1].codec_type).toBe('audio')
    expect(probe.streams[1].tags?.language).toBe('eng')
    expect(probe.streams[1].tags?.title).toBe('English Stereo')
  })

  test('publishes export_progress events with correct identity', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

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

    const outputPath = join(tmpDir, 'export-progress.mkv')

    const events: { media_id: string; output: string; ratio: number }[] = []
    const ac = new AbortController()

    const collecting = (async () => {
      for await (const event of PubSub.subscribe(
        'export_progress',
        ac.signal
      )) {
        events.push(event)
      }
    })().catch(() => {})

    const exporter = new Exporter({ id: media.id })

    await exporter.export({ output: outputPath })

    ac.abort()
    await collecting

    expect(events.length).toBeGreaterThan(0)
    expect(events.every((e) => e.media_id === media.id)).toBe(true)
    expect(events.every((e) => e.output === outputPath)).toBe(true)
    expect(events.at(-1)?.ratio).toBe(1)
  })
})
