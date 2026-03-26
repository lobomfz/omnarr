import { describe, expect, test, beforeEach } from 'bun:test'

import { database } from '@/db/connection'
import { Player } from '@/player'

import { seedMedia, seedDownloadWithTracks } from './seed'

beforeEach(() => {
  database.reset()
})

describe('Player — codec validation', () => {
  test('compatible codecs pass validation', async () => {
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
        channel_layout: '5.1',
      },
    ])

    const player = new Player(media.id)
    const resolved = await player.resolveTracks({})

    player.validateCodecs(resolved)
  })

  test('incompatible video codec produces error with details', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'vp9',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        channel_layout: '5.1',
      },
    ])

    const player = new Player(media.id)
    const resolved = await player.resolveTracks({})

    expect(() => player.validateCodecs(resolved)).toThrow(
      /video.*vp9.*h264.*hevc/i
    )
  })

  test('incompatible audio codec produces error with details', async () => {
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
        codec_name: 'opus',
        is_default: true,
        channel_layout: '5.1',
      },
    ])

    const player = new Player(media.id)
    const resolved = await player.resolveTracks({})

    expect(() => player.validateCodecs(resolved)).toThrow(
      /audio.*opus.*aac.*ac3.*eac3/i
    )
  })

  test('incompatible subtitle codec produces error with details', async () => {
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
    const resolved = await player.resolveTracks({ sub: 0 })

    expect(() => player.validateCodecs(resolved)).toThrow(
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
