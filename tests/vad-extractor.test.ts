import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  afterAll,
} from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { PubSub } from '@/api/pubsub'
import { VadExtractor } from '@/audio/vad-extractor'
import { ScanProgress } from '@/core/scan-progress'
import { DbMediaTracks } from '@/db/media-tracks'

import { TestSeed } from './helpers/seed'

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

const noopPublish = {
  media_id: 'test',
  media_file_id: 0,
  track_id: 0,
}

describe('VadExtractor.extract', () => {
  test('returns Float32Array for silent audio', async () => {
    const result = await new VadExtractor(
      { path: silentMkv },
      noopPublish
    ).extract()

    expect(result).toBeInstanceOf(Float32Array)
    expect(result.length).toBe(0)
  })

  test('timestamps are in ascending order with start < end', async () => {
    const result = await new VadExtractor(
      { path: speechMkv },
      noopPublish
    ).extract()

    expect(result).toBeInstanceOf(Float32Array)

    for (let i = 0; i < result.length; i += 2) {
      expect(result[i]).toBeLessThan(result[i + 1])
    }

    for (let i = 2; i < result.length; i += 2) {
      expect(result[i]).toBeGreaterThanOrEqual(result[i - 1])
    }
  })

  test('result length is always even (start/end pairs)', async () => {
    const result = await new VadExtractor(
      { path: speechMkv },
      noopPublish
    ).extract()

    expect(result.length % 2).toBe(0)
  })
})

describe('VadExtractor.extract — publish', () => {
  beforeEach(() => {
    TestSeed.reset()
  })

  test('updates track scan_ratio and publishes aggregated scan_file_progress', async () => {
    const media = await TestSeed.library.matrix()

    const { file } = await TestSeed.player.downloadWithTracks(
      media.id,
      'matrix-silent',
      silentMkv,
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          scan_ratio: 0,
        },
      ]
    )

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const audioTrack = tracks.find((t) => t.stream_type === 'audio')!

    const events: {
      media_id: string
      path: string
      current_step: 'keyframes' | 'vad'
      ratio: number
    }[] = []
    const ac = new AbortController()

    const collecting = (async () => {
      for await (const event of PubSub.subscribe(
        'scan_file_progress',
        ac.signal
      )) {
        events.push(event)
      }
    })().catch(() => {})

    await new VadExtractor(
      { path: silentMkv },
      {
        media_id: media.id,
        media_file_id: file.id,
        track_id: audioTrack.id,
      }
    ).extract({ duration: 2 })

    await ScanProgress.publishTrack({
      media_id: media.id,
      media_file_id: file.id,
      track_id: audioTrack.id,
      path: silentMkv,
      current_step: 'vad',
      ratio: 1,
    })

    await Bun.sleep(50)
    ac.abort()
    await collecting

    const vadEvents = events.filter(
      (e) => e.current_step === 'vad' && e.path === silentMkv
    )

    expect(vadEvents.length).toBeGreaterThan(0)
    expect(vadEvents.every((e) => e.media_id === media.id)).toBe(true)
    expect(vadEvents.every((e) => e.ratio >= 0 && e.ratio <= 1)).toBe(true)

    const after = await DbMediaTracks.getById(audioTrack.id)
    expect(after?.scan_ratio).toBe(1)
  })
})
