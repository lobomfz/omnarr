import { describe, expect, test } from 'bun:test'

import { Formatters } from '@/formatters'

describe('Formatters', () => {
  describe('seasonEpisodeTag', () => {
    test('formats full S/E', () => {
      expect(Formatters.seasonEpisodeTag(1, 3)).toBe('S01E03')
    })

    test('formats season-only when episode is null', () => {
      expect(Formatters.seasonEpisodeTag(1, null)).toBe('S01')
    })

    test('returns empty for null season', () => {
      expect(Formatters.seasonEpisodeTag(null, null)).toBe('')
    })

    test('pads double-digit numbers', () => {
      expect(Formatters.seasonEpisodeTag(10, 23)).toBe('S10E23')
    })
  })

  describe('mediaTitle', () => {
    test('includes year when present', () => {
      expect(Formatters.mediaTitle({ title: 'The Matrix', year: 1999 })).toBe(
        'The Matrix (1999)'
      )
    })

    test('returns title alone when year is null', () => {
      expect(Formatters.mediaTitle({ title: 'The Matrix', year: null })).toBe(
        'The Matrix'
      )
    })

    test('includes S/E for episode download', () => {
      expect(
        Formatters.mediaTitle({
          title: 'Breaking Bad',
          year: 2008,
          season_number: 1,
          episode_number: 3,
          indexer_source: 'beyond-hd',
        })
      ).toBe('Breaking Bad (2008) - S01E03 [beyond-hd]')
    })

    test('includes season-only for season pack', () => {
      expect(
        Formatters.mediaTitle({
          title: 'Breaking Bad',
          year: 2008,
          season_number: 1,
          indexer_source: 'beyond-hd',
        })
      ).toBe('Breaking Bad (2008) - S01 [beyond-hd]')
    })

    test('no S/E when season_number is absent', () => {
      expect(
        Formatters.mediaTitle({
          title: 'The Matrix',
          year: 1999,
          indexer_source: 'beyond-hd',
        })
      ).toBe('The Matrix (1999) [beyond-hd]')
    })
  })

  describe('progress', () => {
    test('formats ratio as percentage', () => {
      expect(Formatters.progress(0.75)).toBe('75.0%')
    })

    test('formats zero', () => {
      expect(Formatters.progress(0)).toBe('0.0%')
    })

    test('formats complete', () => {
      expect(Formatters.progress(1)).toBe('100.0%')
    })
  })

  describe('size', () => {
    test('formats gigabytes', () => {
      expect(Formatters.size(50_000_000_000)).toBe('50.0GB')
    })

    test('formats megabytes when under 1GB', () => {
      expect(Formatters.size(500_000_000)).toBe('500MB')
    })

    test('formats small megabytes', () => {
      expect(Formatters.size(15_000_000)).toBe('15MB')
    })
  })

  describe('speed', () => {
    test('formats megabytes per second', () => {
      expect(Formatters.speed(5_000_000)).toBe('5.0MB/s')
    })

    test('formats kilobytes per second when under 1MB/s', () => {
      expect(Formatters.speed(500_000)).toBe('500KB/s')
    })

    test('formats small speeds', () => {
      expect(Formatters.speed(50_000)).toBe('50KB/s')
    })
  })

  describe('eta', () => {
    test('returns dash for zero', () => {
      expect(Formatters.eta(0)).toBe('—')
    })

    test('returns dash for negative', () => {
      expect(Formatters.eta(-1)).toBe('—')
    })

    test('returns dash for very large values', () => {
      expect(Formatters.eta(8_640_000)).toBe('—')
    })

    test('formats seconds', () => {
      expect(Formatters.eta(45)).toBe('45s')
    })

    test('formats minutes', () => {
      expect(Formatters.eta(600)).toBe('10min')
    })

    test('formats hours with minutes', () => {
      expect(Formatters.eta(5400)).toBe('1h 30min')
    })

    test('formats exact hours', () => {
      expect(Formatters.eta(7200)).toBe('2h')
    })
  })

  describe('mediaStatus', () => {
    test('shows episode progress for TV', () => {
      expect(
        Formatters.mediaStatus({
          file_count: 2,
          track_count: 4,
          download_status: null,
          total_episodes: 20,
          episodes_with_files: 2,
        })
      ).toBe('2/20 episodes')
    })

    test('shows zero progress for TV with no files', () => {
      expect(
        Formatters.mediaStatus({
          file_count: 0,
          track_count: 0,
          download_status: 'downloading',
          total_episodes: 20,
          episodes_with_files: 0,
        })
      ).toBe('0/20 episodes')
    })

    test('shows scanned for movie with files', () => {
      expect(
        Formatters.mediaStatus({
          file_count: 1,
          track_count: 3,
          download_status: null,
          total_episodes: 0,
          episodes_with_files: 0,
        })
      ).toBe('scanned')
    })

    test('shows downloading for movie in progress', () => {
      expect(
        Formatters.mediaStatus({
          file_count: 0,
          track_count: 0,
          download_status: 'downloading',
          total_episodes: 0,
          episodes_with_files: 0,
        })
      ).toBe('downloading')
    })
  })

  describe('trackSummary', () => {
    test('formats video track with resolution', () => {
      expect(
        Formatters.trackSummary('video', {
          codec_name: 'h264',
          width: 1920,
          height: 1080,
          channel_layout: null,
          language: null,
        })
      ).toBe('video: h264 1920x1080')
    })

    test('formats audio track with channel layout and language', () => {
      expect(
        Formatters.trackSummary('audio', {
          codec_name: 'aac',
          width: null,
          height: null,
          channel_layout: '5.1',
          language: 'en',
        })
      ).toBe('audio: aac 5.1 en')
    })

    test('formats minimal track', () => {
      expect(
        Formatters.trackSummary('subtitle', {
          codec_name: 'subrip',
          width: null,
          height: null,
          channel_layout: null,
          language: null,
        })
      ).toBe('subtitle: subrip')
    })
  })

  describe('appendDownloads', () => {
    test('track indices are global across files', () => {
      const lines: string[] = []

      const track = (
        index: number,
        type: 'video' | 'audio',
        codec: string
      ) => ({
        stream_index: index,
        stream_type: type,
        codec_name: codec,
        language: null,
        title: null,
        is_default: true,
        width: null,
        height: null,
        channel_layout: null,
      })

      Formatters.appendDownloads(lines, [
        {
          id: 1,
          status: 'completed' as const,
          progress: 1,
          speed: 0,
          eta: 0,
          content_path: null,
          error_at: null,
          started_at: '2026-01-01',
          files: [
            {
              id: 1,
              path: '/a/file1.mkv',
              size: 1_000_000_000,
              format_name: 'matroska',
              duration: 7200,
              has_keyframes: true,
              has_envelope: true,
              tracks: [track(0, 'video', 'h264'), track(1, 'audio', 'aac')],
            },
            {
              id: 2,
              path: '/a/file2.mkv',
              size: 2_000_000_000,
              format_name: 'matroska',
              duration: 5400,
              has_keyframes: true,
              has_envelope: true,
              tracks: [track(0, 'video', 'hevc'), track(1, 'audio', 'opus')],
            },
          ],
        },
      ])

      const hevcLine = lines.find((l) => l.includes('hevc'))
      const opusLine = lines.find((l) => l.includes('opus'))

      expect(hevcLine).toContain('video 1:')
      expect(opusLine).toContain('audio 1:')
    })
  })
})
