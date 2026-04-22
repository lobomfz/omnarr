import { describe, expect, test } from 'bun:test'

import { Formatters } from '@/lib/formatters'

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

  describe('duration', () => {
    test('formats hours and minutes', () => {
      expect(Formatters.duration(3661)).toBe('1h 1m')
    })

    test('formats exact hours', () => {
      expect(Formatters.duration(7200)).toBe('2h 0m')
    })

    test('formats minutes only when under an hour', () => {
      expect(Formatters.duration(120)).toBe('2m')
    })

    test('floors to zero minutes for sub-minute values', () => {
      expect(Formatters.duration(59)).toBe('0m')
      expect(Formatters.duration(0)).toBe('0m')
    })

    test('negative input produces negative floor values', () => {
      expect(Formatters.duration(-1)).toBe('-1m')
      expect(Formatters.duration(-3661)).toBe('-2m')
    })
  })

  describe('mediaStatus', () => {
    test('shows episode progress for TV', () => {
      expect(
        Formatters.mediaStatus({
          file_count: 2,
          track_count: 4,
          download: null,
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
          download: { status: 'downloading' },
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
          download: null,
          total_episodes: null,
          episodes_with_files: null,
        })
      ).toBe('scanned')
    })

    test('shows downloading for movie in progress', () => {
      expect(
        Formatters.mediaStatus({
          file_count: 0,
          track_count: 0,
          download: { status: 'downloading' },
          total_episodes: null,
          episodes_with_files: null,
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
    test('shows database track ids in info output', () => {
      const lines: string[] = []

      const track = (
        id: number,
        index: number,
        type: 'video' | 'audio',
        codec: string
      ) => ({
        id,
        stream_index: index,
        stream_type: type,
        codec_name: codec,
        language: null,
        title: null,
        is_default: true,
        width: null,
        height: null,
        channel_layout: null,
        bit_rate: null,
        scan_ratio: null,
      })

      Formatters.appendDownloads(lines, [
        {
          id: 1,
          source_id: 'test_hash',
          source: 'torrent' as const,
          status: 'completed' as const,
          progress: 1,
          speed: 0,
          eta: 0,
          content_path: null,
          error_at: null,
          season_number: null,
          episode_number: null,
          started_at: '2026-01-01',
          files: [
            {
              id: 1,
              path: '/a/file1.mkv',
              size: 1_000_000_000,
              format_name: 'matroska',
              duration: 7200,
              has_keyframes: true,
              has_vad: true,
              tracks: [
                track(101, 0, 'video', 'h264'),
                track(205, 1, 'audio', 'aac'),
              ],
            },
            {
              id: 2,
              path: '/a/file2.mkv',
              size: 2_000_000_000,
              format_name: 'matroska',
              duration: 5400,
              has_keyframes: true,
              has_vad: true,
              tracks: [
                track(309, 0, 'video', 'hevc'),
                track(412, 1, 'audio', 'opus'),
              ],
            },
          ],
        },
      ])

      const hevcLine = lines.find((l) => l.includes('hevc'))
      const opusLine = lines.find((l) => l.includes('opus'))

      expect(hevcLine).toContain('video 309:')
      expect(opusLine).toContain('audio 412:')
    })
  })

  describe('fileStats', () => {
    test('formats size, format, and duration', () => {
      expect(
        Formatters.fileStats({
          size: 8_000_000_000,
          format_name: 'matroska',
          duration: 7200,
        })
      ).toBe('8.0GB, matroska, 120.0min')
    })

    test('handles null format and duration', () => {
      expect(
        Formatters.fileStats({
          size: 500_000_000,
          format_name: null,
          duration: null,
        })
      ).toBe('500MB, ?, ?')
    })
  })

  describe('scanResult', () => {
    test('formats files with tracks and scan status', () => {
      const result = Formatters.scanResult([
        {
          id: 1,
          media_id: 'X',
          download_id: 1,
          path: '/movies/movie.mkv',
          size: 8_000_000_000,
          format_name: 'matroska',
          start_time: null,
          duration: 7200,
          episode_id: null,
          scanned_at: new Date('2026-01-01'),
          keyframes: 500,
          has_vad: true,
          tracks: [
            {
              id: 1,
              stream_index: 0,
              stream_type: 'video',
              codec_name: 'h264',
              language: null,
              title: null,
              is_default: true,
              width: 1920,
              height: 1080,
              channel_layout: null,
            },
          ],
        },
      ])

      expect(result).toContain('movie.mkv')
      expect(result).toContain('8.0GB')
      expect(result).toContain('h264')
      expect(result).toContain('1920x1080')
      expect(result).toContain('keyframes: 500')
      expect(result).toContain('vad: yes')
    })

    test('shows vad: no when has_vad is false', () => {
      const result = Formatters.scanResult([
        {
          id: 1,
          media_id: 'X',
          download_id: 1,
          path: '/movies/movie.mkv',
          size: 1_000_000_000,
          format_name: 'matroska',
          start_time: null,
          duration: 3600,
          episode_id: null,
          scanned_at: new Date('2026-01-01'),
          keyframes: 0,
          has_vad: false,
          tracks: [],
        },
      ])

      expect(result).toContain('vad: no')
      expect(result).not.toContain('keyframes')
    })
  })

  describe('appendSeasons', () => {
    test('formats seasons with downloaded episodes', () => {
      const lines: string[] = []

      Formatters.appendSeasons(lines, [
        {
          season_number: 1,
          title: 'Season 1',
          episodes: [
            {
              episode_number: 1,
              title: 'Pilot',
              files: [
                {
                  id: 1,
                  download_id: 10,
                  path: '/tv/s01e01.mkv',
                  size: 2_000_000_000,
                  format_name: 'matroska',
                  duration: 3600,
                  has_keyframes: true,
                  has_vad: true,
                  tracks: [
                    {
                      id: 1,
                      stream_index: 0,
                      stream_type: 'video',
                      codec_name: 'hevc',
                      language: null,
                      title: null,
                      is_default: true,
                      width: 3840,
                      height: 2160,
                      channel_layout: null,
                      bit_rate: null,
                      scan_ratio: null,
                    },
                  ],
                },
              ],
            },
            { episode_number: 2, title: 'Second', files: [] },
          ],
        },
      ])

      const output = lines.join('\n')

      expect(output).toContain('Season 1')
      expect(output).toContain('E01  Pilot')
      expect(output).toContain('s01e01.mkv')
      expect(output).toContain('hevc')
      expect(output).not.toContain('E02')
    })

    test('skips seasons with no downloaded episodes', () => {
      const lines: string[] = []

      Formatters.appendSeasons(lines, [
        {
          season_number: 1,
          title: 'Season 1',
          episodes: [{ episode_number: 1, title: 'Pilot', files: [] }],
        },
      ])

      expect(lines).toHaveLength(0)
    })
  })
})
