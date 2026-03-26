import { describe, expect, test, beforeEach } from 'bun:test'

import { CodecStrategy } from '@/codec-strategy'
import { config } from '@/config'
import { database } from '@/db/connection'
import { Player } from '@/player'

import { seedMedia, seedDownloadWithTracks } from './seed'

beforeEach(() => {
  database.reset()
})

describe('Player — codec strategy resolution', () => {
  test('compatible codecs produce copy strategy', async () => {
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
        channels: 6,
        channel_layout: '5.1',
      },
    ])

    const player = new Player(media.id)
    const resolved = await player.resolveTracks({})
    const strategy = CodecStrategy.resolve(resolved, config.transcoding)

    expect(strategy.video).toEqual({ mode: 'copy' })
    expect(strategy.audio).toEqual({ mode: 'copy' })
  })

  test('incompatible video codec produces transcode strategy', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'av1',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        channels: 2,
        channel_layout: 'stereo',
      },
    ])

    const player = new Player(media.id)
    const resolved = await player.resolveTracks({})
    const strategy = CodecStrategy.resolve(resolved, config.transcoding)

    expect(strategy.video.mode).toBe('transcode')
    expect(strategy.audio).toEqual({ mode: 'copy' })
  })

  test('incompatible audio codec produces transcode strategy preserving channels', async () => {
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
        codec_name: 'dts',
        is_default: true,
        channels: 6,
        channel_layout: '5.1',
      },
    ])

    const player = new Player(media.id)
    const resolved = await player.resolveTracks({})
    const strategy = CodecStrategy.resolve(resolved, config.transcoding)

    expect(strategy.video).toEqual({ mode: 'copy' })
    expect(strategy.audio).toEqual({
      mode: 'transcode',
      codec: 'aac',
      channels: 6,
    })
  })

  test('incompatible subtitle codec still produces error', async () => {
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
      {
        stream_index: 2,
        stream_type: 'subtitle',
        codec_name: 'dvd_subtitle',
        is_default: false,
      },
    ])

    const player = new Player(media.id)

    await expect(player.start({ sub: 0 }, { port: 0 })).rejects.toThrow(
      /subtitle.*dvd_subtitle.*subrip.*ass.*mov_text/i
    )
  })
})

describe('Player — master playlist', () => {
  test('generates master.m3u8 referencing video.m3u8', () => {
    const playlist = Player.masterPlaylist()

    expect(playlist).toContain('#EXTM3U')
    expect(playlist).toContain('#EXT-X-STREAM-INF:BANDWIDTH=0')
    expect(playlist).toContain('video.m3u8')
    expect(playlist).not.toContain('subs')
  })

  test('includes subtitle reference when subtitle provided', () => {
    const playlist = Player.masterPlaylist({
      language: 'por',
      name: 'Portuguese',
    })

    expect(playlist).toContain('SUBTITLES')
    expect(playlist).toContain('LANGUAGE="por"')
    expect(playlist).toContain('NAME="Portuguese"')
    expect(playlist).toContain('subs.vtt')
  })
})
