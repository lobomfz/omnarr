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

import { database } from '@/db/connection'
import { Player } from '@/player'

import { MediaFixtures } from '../fixtures/media'
import { seedMedia, seedDownloadWithTracks } from './seed'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-hls-'))
const refMkv = join(tmpDir, 'ref.mkv')
const refSubsMkv = join(tmpDir, 'ref-subs.mkv')

beforeAll(async () => {
  await MediaFixtures.generate(refMkv)
  await MediaFixtures.generateWithSubs(refSubsMkv, tmpDir)
})

beforeEach(() => {
  database.reset()
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('Player — HLS generation', () => {
  test('generates m3u8 and ts segments from single file', async () => {
    const media = await seedMedia()
    const filePath = join(tmpDir, 'single/movie.mkv')

    await MediaFixtures.copy(refMkv, filePath)

    await seedDownloadWithTracks(media.id, 'hls_hash', filePath, [
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

    const player = new Player(media.id)
    const resolved = await player.resolveTracks({})
    const hlsDir = join(tmpDir, 'hls-single')

    await player.generateHls(resolved, hlsDir)

    const playlistText = await Bun.file(join(hlsDir, 'video.m3u8')).text()

    expect(playlistText).toContain('#EXTM3U')
    expect(playlistText).toContain('#EXTINF:')

    const segments = await Array.fromAsync(new Bun.Glob('*.ts').scan(hlsDir))

    expect(segments.length).toBeGreaterThan(0)
  })

  test('generates hls with video and audio from different files', async () => {
    const media = await seedMedia()
    const videoPath = join(tmpDir, 'multi/video.mkv')
    const audioPath = join(tmpDir, 'multi/audio.mkv')

    await MediaFixtures.copy(refMkv, videoPath)
    await MediaFixtures.copy(refMkv, audioPath)

    await seedDownloadWithTracks(media.id, 'video_hash', videoPath, [
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

    await seedDownloadWithTracks(media.id, 'audio_hash', audioPath, [
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

    const player = new Player(media.id)
    const resolved = await player.resolveTracks({ video: 0, audio: 1 })
    const hlsDir = join(tmpDir, 'hls-multi')

    await player.generateHls(resolved, hlsDir)

    const playlistText = await Bun.file(join(hlsDir, 'video.m3u8')).text()

    expect(playlistText).toContain('#EXTM3U')
    expect(playlistText).toContain('#EXTINF:')

    const segments = await Array.fromAsync(new Bun.Glob('*.ts').scan(hlsDir))

    expect(segments.length).toBeGreaterThan(0)
  })

  test('converts subtitle to WebVTT', async () => {
    const media = await seedMedia()
    const filePath = join(tmpDir, 'subs/movie.mkv')

    await MediaFixtures.copy(refSubsMkv, filePath)

    await seedDownloadWithTracks(media.id, 'sub_hash', filePath, [
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
      {
        stream_index: 2,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: false,
        language: 'por',
      },
    ])

    const player = new Player(media.id)
    const resolved = await player.resolveTracks({ sub: 0 })
    const hlsDir = join(tmpDir, 'hls-subs')

    await Player.convertSubtitle(resolved.subtitle!, hlsDir)

    const vttFile = Bun.file(join(hlsDir, 'subs.vtt'))

    expect(await vttFile.exists()).toBe(true)

    const content = await vttFile.text()

    expect(content).toContain('WEBVTT')
  })
})
