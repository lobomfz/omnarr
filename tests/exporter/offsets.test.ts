import { describe, expect, test, beforeEach } from 'bun:test'

import { database } from '@/db/connection'
import { Exporter } from '@/core/exporter'

import { seedMedia, seedDownloadWithTracks, seedVad } from '../player/seed'

beforeEach(() => {
  database.reset()
})

describe('Exporter — offset computation', () => {
  test('same-download tracks get offset 0 without VAD lookup', async () => {
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
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)

    expect(offsets.get(resolved.video.download_id)).toBe(0)
  })

  test('different-download with VAD data produces computed offset', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
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

    const { file: audioFile } = await seedDownloadWithTracks(
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

    await seedVad(videoFile.id, 42)
    await seedVad(audioFile.id, 42)

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)

    expect(offsets.get(resolved.audio[1].download_id)).toBe(0)
  })

  test('offset is computed once per download, not per track', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
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

    const { file: audioFile, download: audioDl } = await seedDownloadWithTracks(
      media.id,
      'hash2',
      '/tracks/multi.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: false,
          language: 'por',
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'ac3',
          is_default: false,
          language: 'spa',
        },
      ]
    )

    await seedVad(videoFile.id, 42)
    await seedVad(audioFile.id, 42)

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)

    const porTrack = resolved.audio.find((a) => a.language === 'por')!
    const spaTrack = resolved.audio.find((a) => a.language === 'spa')!

    expect(porTrack.download_id).toBe(audioDl.id)
    expect(spaTrack.download_id).toBe(audioDl.id)
    expect(offsets.get(audioDl.id)).toBe(0)
  })

  test('missing VAD for video file produces offset 0', async () => {
    const media = await seedMedia()

    await seedDownloadWithTracks(media.id, 'hash1', '/movies/video.mkv', [
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

    const { file: audioFile, download: audioDl } = await seedDownloadWithTracks(
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

    await seedVad(audioFile.id, 42)

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)

    expect(offsets.get(audioDl.id)).toBe(0)
  })

  test('missing VAD for other download produces offset 0', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
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

    const { download: audioDl } = await seedDownloadWithTracks(
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

    await seedVad(videoFile.id, 42)

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)

    expect(offsets.get(audioDl.id)).toBe(0)
  })

  test('low confidence correlation produces offset 0', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
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

    const { file: audioFile, download: audioDl } = await seedDownloadWithTracks(
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

    await seedVad(videoFile.id, 111)
    await seedVad(audioFile.id, 222)

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)

    expect(offsets.get(audioDl.id)).toBe(0)
  })

  test('multiple different downloads each get independent offset', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
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

    const { file: audioFile2, download: dl2 } = await seedDownloadWithTracks(
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

    const { file: audioFile3, download: dl3 } = await seedDownloadWithTracks(
      media.id,
      'hash3',
      '/tracks/audio_spa.mka',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'ac3',
          is_default: false,
          language: 'spa',
        },
      ]
    )

    await seedVad(videoFile.id, 42)
    await seedVad(audioFile2.id, 42)
    await seedVad(audioFile3.id, 42)

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)

    expect(offsets.has(dl2.id)).toBe(true)
    expect(offsets.has(dl3.id)).toBe(true)
    expect(offsets.get(dl2.id)).toBe(0)
    expect(offsets.get(dl3.id)).toBe(0)
  })

  test('subtitle download shares offset with other tracks from same download', async () => {
    const media = await seedMedia()

    const { file: videoFile } = await seedDownloadWithTracks(
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

    const { file: otherFile, download: dl2 } = await seedDownloadWithTracks(
      media.id,
      'hash2',
      '/tracks/foreign.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'audio',
          codec_name: 'opus',
          is_default: false,
          language: 'por',
        },
        {
          stream_index: 1,
          stream_type: 'subtitle',
          codec_name: 'subrip',
          is_default: false,
          language: 'por',
        },
      ]
    )

    await seedVad(videoFile.id, 42)
    await seedVad(otherFile.id, 42)

    const exporter = new Exporter({ id: media.id })
    const resolved = await exporter.resolveTracks({})
    const offsets = await exporter.resolveOffsets(resolved)

    const audioOffset = offsets.get(dl2.id)
    const subTrack = resolved.subtitle[0]

    expect(subTrack.download_id).toBe(dl2.id)
    expect(audioOffset).toBe(offsets.get(subTrack.download_id))
  })
})
