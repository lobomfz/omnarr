import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterAll,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { database } from '@/db/connection'
import { Player } from '@/player/player'

import { MediaFixtures } from '../fixtures/media'
import { seedMedia, seedDownloadWithTracks } from './seed'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-start-'))
const refMkv = join(tmpDir, 'ref.mkv')
const refSubsMkv = join(tmpDir, 'ref-subs.mkv')

let refKeyframes: number[]
let refDuration: number
let refSubsKeyframes: number[]
let refSubsDuration: number

beforeAll(async () => {
  await MediaFixtures.generate(refMkv)
  await MediaFixtures.generateWithSubs(refSubsMkv, tmpDir)

  const probe = await new FFmpegBuilder().input(refMkv).probe()

  refKeyframes = await new FFmpegBuilder().input(refMkv).probeKeyframes()
  refDuration = probe.format.duration

  const subsProbe = await new FFmpegBuilder().input(refSubsMkv).probe()

  refSubsKeyframes = await new FFmpegBuilder()
    .input(refSubsMkv)
    .probeKeyframes()
  refSubsDuration = subsProbe.format.duration
})

beforeEach(() => {
  database.reset()
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('Player — start', () => {
  test('resolves tracks, generates HLS, and serves playable URL', async () => {
    const media = await seedMedia()
    const filePath = join(tmpDir, 'start/movie.mkv')

    await MediaFixtures.copy(refMkv, filePath)

    await seedDownloadWithTracks(
      media.id,
      'start_hash',
      filePath,
      [
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
      ],
      { duration: refDuration, keyframes: refKeyframes }
    )

    const player = new Player({ id: media.id })
    const result = await player.start({}, { port: 0 })

    expect(result.url).toContain('master.m3u8')
    expect(result.video.codec_name).toBe('h264')
    expect(result.audio.codec_name).toBe('aac')
    expect(result.subtitle).toBeNull()
    expect(result.audioOffset).toBe(0)
    expect(result.subtitleOffset).toBe(0)

    const masterRes = await fetch(result.url)

    expect(masterRes.status).toBe(200)

    const masterText = await masterRes.text()

    expect(masterText).toContain('#EXTM3U')
    expect(masterText).toContain('video.m3u8')

    const videoUrl = result.url.replace('master.m3u8', 'video.m3u8')
    const videoRes = await fetch(videoUrl)

    expect(videoRes.status).toBe(200)

    const videoText = await videoRes.text()

    expect(videoText).toContain('#EXTINF:')

    await player.stop()
  })

  test('subtitle served via HLS media playlist, not raw VTT', async () => {
    const media = await seedMedia()
    const filePath = join(tmpDir, 'start-subs-hls/movie.mkv')
    const srtPath = join(tmpDir, 'start-subs-hls/sub.srt')

    await MediaFixtures.copy(refSubsMkv, filePath)
    await Bun.write(srtPath, '1\n00:00:00,000 --> 00:00:00,100\nTest\n')

    await seedDownloadWithTracks(
      media.id,
      'subhls_hash',
      filePath,
      [
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
      ],
      { duration: refSubsDuration, keyframes: refSubsKeyframes }
    )

    await seedDownloadWithTracks(media.id, 'subhls_sub', srtPath, [
      {
        stream_index: 0,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: false,
        language: 'por',
      },
    ])

    const player = new Player({ id: media.id })
    const result = await player.start({ sub: 0 }, { port: 0 })

    const masterText = await fetch(result.url).then((r) => r.text())

    expect(masterText).toContain('subs.m3u8')
    expect(masterText).not.toContain('subs.vtt')

    const subsPlaylistUrl = result.url.replace('master.m3u8', 'subs.m3u8')
    const subsText = await fetch(subsPlaylistUrl).then((r) => r.text())

    expect(subsText).toContain('#EXTM3U')
    expect(subsText).toContain('subs_000.vtt')
    expect(subsText).toContain('#EXT-X-ENDLIST')

    await player.stop()
  })

  test('includes subtitle in master playlist when selected', async () => {
    const media = await seedMedia()
    const filePath = join(tmpDir, 'start-subs/movie.mkv')
    const srtPath = join(tmpDir, 'start-subs/sub.srt')

    await MediaFixtures.copy(refSubsMkv, filePath)
    await Bun.write(srtPath, '1\n00:00:00,000 --> 00:00:00,100\nTest\n')

    await seedDownloadWithTracks(
      media.id,
      'startsub_hash',
      filePath,
      [
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
      ],
      { duration: refSubsDuration, keyframes: refSubsKeyframes }
    )

    await seedDownloadWithTracks(media.id, 'startsub_sub', srtPath, [
      {
        stream_index: 0,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: false,
        language: 'por',
      },
    ])

    const player = new Player({ id: media.id })
    const result = await player.start({ sub: 0 }, { port: 0 })

    expect(result.subtitle).not.toBeNull()
    expect(result.subtitle!.language).toBe('por')
    expect(result.subtitleOffset).toBe(0)

    const masterRes = await fetch(result.url)
    const masterText = await masterRes.text()

    expect(masterText).toContain('SUBTITLES')
    expect(masterText).toContain('subs.m3u8')

    const vttUrl = result.url.replace('master.m3u8', 'subs_000.vtt')
    const vttRes = await fetch(vttUrl)

    expect(vttRes.status).toBe(200)

    const vttText = await vttRes.text()

    expect(vttText).toContain('WEBVTT')

    await player.stop()
  })
})
