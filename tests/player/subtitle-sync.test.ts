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

import { database } from '@/db/connection'
import { Player } from '@/player/player'

import { seedMedia, seedDownloadWithTracks, seedVad } from './seed'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-subsync-'))

const SRT_CONTENT = `1
00:00:01,500 --> 00:00:04,000
Hello world

2
00:00:10,000 --> 00:00:15,000
Second line

3
00:00:20,000 --> 00:00:25,000
Third line

4
00:00:30,000 --> 00:00:35,000
Fourth line

5
00:00:40,000 --> 00:00:45,000
Fifth line
`

const srtPath = join(tmpDir, 'sub_en.srt')

beforeAll(async () => {
  await Bun.write(srtPath, SRT_CONTENT)
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

beforeEach(() => {
  database.reset()
})

describe('Player.resolveSubtitleOffset', () => {
  test('no subtitle selected → offset is 0', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie.mkv', [
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
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({})
    const offset = await player.resolveSubtitleOffset(resolved)

    expect(offset).toEqual({ offset: 0, confidence: null })
  })

  test('same download_id → offset is 0', async () => {
    const media = await seedMedia()

    const { file } = await seedDownloadWithTracks(
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
        },
      ]
    )

    await seedVad(file.id, 42)

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({ sub: 0 })
    const offset = await player.resolveSubtitleOffset(resolved)

    expect(offset).toEqual({ offset: 0, confidence: null })
  })

  test('different download_id with missing vad → offset is 0', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'video_hash', '/movies/movie.mkv', [
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
    ])

    await seedDownloadWithTracks(media.id, 'sub_hash', srtPath, [
      {
        stream_index: 0,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: false,
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({ sub: 0 })
    const offset = await player.resolveSubtitleOffset(resolved)

    expect(offset).toEqual({ offset: 0, confidence: null })
  })

  test('different download_id with vad → attempts correlation', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
      media.id,
      'video_hash',
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

    await seedVad(videoFile.id, 42)

    await seedDownloadWithTracks(media.id, 'sub_hash', srtPath, [
      {
        stream_index: 0,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: false,
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({ sub: 0 })
    const offset = await player.resolveSubtitleOffset(resolved)

    expect(offset).toHaveProperty('offset')
    expect(offset).toHaveProperty('confidence')
    expect(typeof offset.offset).toBe('number')
  })

  test('separate audio file → uses audio file vad for correlation', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
      media.id,
      'video_hash',
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
      ]
    )

    const { file: audioFile } = await seedDownloadWithTracks(
      media.id,
      'audio_hash',
      '/movies/movie.audio.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
      ]
    )

    await seedVad(audioFile.id, 99)

    await seedDownloadWithTracks(media.id, 'sub_hash', srtPath, [
      {
        stream_index: 0,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: false,
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({ sub: 0 })

    expect(resolved.video.file_id).toBe(videoFile.id)
    expect(resolved.audio.file_id).toBe(audioFile.id)
    expect(resolved.video.file_id).not.toBe(resolved.audio.file_id)

    const offset = await player.resolveSubtitleOffset(resolved)

    expect(offset).toHaveProperty('offset')
    expect(offset).toHaveProperty('confidence')
    expect(typeof offset.offset).toBe('number')
  })
})
