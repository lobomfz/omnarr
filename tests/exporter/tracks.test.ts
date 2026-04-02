import { describe, expect, test, beforeEach } from 'bun:test'

import { database } from '@/db/connection'
import { Exporter } from '@/exporter'

import { seedMedia, seedDownloadWithTracks } from '../player/seed'

beforeEach(() => {
  database.reset()
})

describe('Exporter — track resolution', () => {
  test('no tracks throws error', async () => {
    const media = await seedMedia()
    const exporter = new Exporter({ id: media.id })

    await expect(() => exporter.resolveTracks({})).toThrow(/no tracks found/i)
  })

  test('no video tracks throws error', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/audio.mka', [
      {
        stream_index: 0,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        channel_layout: '5.1',
      },
    ])

    const exporter = new Exporter({ id: media.id })

    await expect(() => exporter.resolveTracks({})).toThrow(/no video tracks/i)
  })

  test('single video track is auto-selected without --video', async () => {
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

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})

    expect(resolved.video.codec_name).toBe('h264')
  })

  test('includes all audio tracks from all downloads', async () => {
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
        language: 'eng',
        channel_layout: '5.1',
      },
    ])

    await seedDownloadWithTracks(media.id, 'hash2', '/movies/audio_pt.mka', [
      {
        stream_index: 0,
        stream_type: 'audio',
        codec_name: 'ac3',
        is_default: false,
        language: 'por',
        channel_layout: '5.1',
      },
    ])

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})

    expect(resolved.audio).toHaveLength(2)
    expect(resolved.audio.map((a) => a.language)).toContain('eng')
    expect(resolved.audio.map((a) => a.language)).toContain('por')
  })

  test('includes all subtitle tracks from all downloads', async () => {
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

    await seedDownloadWithTracks(media.id, 'hash2', '/movies/sub_eng.srt', [
      {
        stream_index: 0,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: false,
        language: 'eng',
      },
    ])

    await seedDownloadWithTracks(media.id, 'hash3', '/movies/sub_por.srt', [
      {
        stream_index: 0,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: false,
        language: 'por',
      },
    ])

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})

    expect(resolved.subtitle).toHaveLength(2)
    expect(resolved.subtitle.map((s) => s.language)).toContain('eng')
    expect(resolved.subtitle.map((s) => s.language)).toContain('por')
  })
})

describe('Exporter — video selection', () => {
  test('multiple video tracks without --video throws error listing options', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie_720.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1280,
        height: 720,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
      },
    ])

    await seedDownloadWithTracks(media.id, 'hash2', '/movies/movie_1080.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'hevc',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'eac3',
        is_default: true,
      },
    ])

    const exporter = new Exporter({ id: media.id })

    try {
      await exporter.resolveTracks({})
      expect.unreachable('should have thrown')
    } catch (err) {
      const msg = (err as Error).message

      expect(msg).toMatch(/--video/i)
      expect(msg).toMatch(/hevc/)
      expect(msg).toMatch(/h264/)
      expect(msg).toMatch(/1920/)
      expect(msg).toMatch(/1280/)
    }
  })

  test('--video N selects correct track by index', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/movie_720.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1280,
        height: 720,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
      },
    ])

    await seedDownloadWithTracks(media.id, 'hash2', '/movies/movie_1080.mkv', [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'hevc',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'eac3',
        is_default: true,
      },
    ])

    const exporter = new Exporter({ id: media.id })

    const resolved0 = await exporter.resolveTracks({ video: 0 })

    expect(resolved0.video.codec_name).toBe('hevc')
    expect(resolved0.video.width).toBe(1920)

    const resolved1 = await exporter.resolveTracks({ video: 1 })

    expect(resolved1.video.codec_name).toBe('h264')
    expect(resolved1.video.width).toBe(1280)
  })

  test('--video out of range throws error', async () => {
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

    const exporter = new Exporter({ id: media.id })

    await expect(() => exporter.resolveTracks({ video: 5 })).toThrow(
      /out of range/i
    )
  })
})
