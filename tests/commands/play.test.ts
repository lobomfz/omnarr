import { describe, expect, test, beforeEach } from 'bun:test'

import { testCommand } from '@bunli/test'

import { PlayCommand } from '@/commands/play'
import { database } from '@/db/connection'

import { seedMedia, seedDownloadWithTracks } from '../player/seed'

beforeEach(() => {
  database.reset()
})

describe('play command', () => {
  test('errors when media not found', async () => {
    const result = await testCommand(PlayCommand, {
      args: ['NOEXIST'],
      flags: {},
    })

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('not found')
  })

  test('errors when media has no scanned tracks', async () => {
    const media = await seedMedia()

    const result = await testCommand(PlayCommand, {
      args: [media.id],
      flags: {},
    })

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('No')
  })

  test('errors when no args provided', async () => {
    const result = await testCommand(PlayCommand, {
      args: [],
      flags: {},
    })

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('Usage')
  })

  test('errors when --video index is out of range', async () => {
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

    const result = await testCommand(PlayCommand, {
      args: [media.id],
      flags: { video: '5' },
    })

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('out of range')
  })

  test('errors when --sub is used but no subtitle tracks exist', async () => {
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

    const result = await testCommand(PlayCommand, {
      args: [media.id],
      flags: { sub: '0' },
    })

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('No subtitle')
  })

  test('errors when --audio index is out of range', async () => {
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

    const result = await testCommand(PlayCommand, {
      args: [media.id],
      flags: { audio: '5' },
    })

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('out of range')
  })
})
