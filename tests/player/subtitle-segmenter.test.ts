import { describe, expect, test } from 'bun:test'

import { SubtitleSegmenter } from '@/player/subtitle-segmenter'

const SRT = `1
00:00:01,500 --> 00:00:04,000
Hello world

2
00:00:08,000 --> 00:00:12,500
Second line

3
00:00:15,000 --> 00:00:18,000
Third line
`

describe('SubtitleSegmenter.parseSrt', () => {
  test('parses cues with start, end, and text', () => {
    const cues = SubtitleSegmenter.parseSrt(SRT)

    expect(cues).toEqual([
      { start: 1.5, end: 4, text: 'Hello world' },
      { start: 8, end: 12.5, text: 'Second line' },
      { start: 15, end: 18, text: 'Third line' },
    ])
  })

  test('parses multi-line cue text', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Line one
Line two
`

    const cues = SubtitleSegmenter.parseSrt(srt)

    expect(cues).toEqual([{ start: 1, end: 3, text: 'Line one\nLine two' }])
  })

  test('returns empty array for empty input', () => {
    const cues = SubtitleSegmenter.parseSrt('')

    expect(cues).toEqual([])
  })

  test('handles cues with hours', () => {
    const srt = `1
01:30:05,200 --> 01:30:10,800
Late cue
`

    const cues = SubtitleSegmenter.parseSrt(srt)

    expect(cues).toEqual([{ start: 5405.2, end: 5410.8, text: 'Late cue' }])
  })
})

describe('SubtitleSegmenter.prepareCues', () => {
  test('sorts cues by start time', () => {
    const srt = `1
00:01:09,000 --> 00:01:12,000
Late cue

2
00:00:24,000 --> 00:00:27,000
Early cue
`

    const cues = SubtitleSegmenter.prepareCues(srt, 0)

    expect(cues[0].text).toBe('Early cue')
    expect(cues[1].text).toBe('Late cue')
  })

  test('applies positive offset', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Shifted
`

    const cues = SubtitleSegmenter.prepareCues(srt, 5)

    expect(cues[0].start).toBe(6)
    expect(cues[0].end).toBe(8)
  })

  test('applies negative offset with clamping to zero', () => {
    const srt = `1
00:00:02,000 --> 00:00:05,000
Clamped
`

    const cues = SubtitleSegmenter.prepareCues(srt, -3)

    expect(cues[0].start).toBe(0)
    expect(cues[0].end).toBe(2)
  })
})

describe('SubtitleSegmenter.computeWindows', () => {
  test('groups short segments into ~20s windows', () => {
    const segments = [
      { pts_time: 0, duration: 5 },
      { pts_time: 5, duration: 5 },
      { pts_time: 10, duration: 5 },
      { pts_time: 15, duration: 5 },
      { pts_time: 20, duration: 5 },
      { pts_time: 25, duration: 5 },
    ]

    const windows = SubtitleSegmenter.computeWindows(segments)

    expect(windows.length).toBe(2)
    expect(windows[0].start).toBe(0)
    expect(windows[0].end).toBe(20)
    expect(windows[0].duration).toBe(20)
    expect(windows[0].firstVideoSegment).toBe(0)
    expect(windows[1].start).toBe(20)
    expect(windows[1].end).toBe(30)
    expect(windows[1].duration).toBe(10)
    expect(windows[1].firstVideoSegment).toBe(4)
  })

  test('single segment shorter than 20s produces one window', () => {
    const segments = [{ pts_time: 0, duration: 8 }]

    const windows = SubtitleSegmenter.computeWindows(segments)

    expect(windows.length).toBe(1)
    expect(windows[0]).toEqual({
      start: 0,
      end: 8,
      duration: 8,
      firstVideoSegment: 0,
    })
  })

  test('total window duration equals total segment duration exactly', () => {
    const segments = [
      { pts_time: 0, duration: 2.1 },
      { pts_time: 2.1, duration: 1.9 },
      { pts_time: 4, duration: 2.3 },
      { pts_time: 6.3, duration: 1.7 },
      { pts_time: 8, duration: 3.5 },
      { pts_time: 11.5, duration: 4.2 },
      { pts_time: 15.7, duration: 2.8 },
      { pts_time: 18.5, duration: 3.1 },
      { pts_time: 21.6, duration: 2.4 },
    ]

    const totalSegDuration = segments.reduce((s, seg) => s + seg.duration, 0)
    const windows = SubtitleSegmenter.computeWindows(segments)
    const totalWindowDuration = windows.reduce((s, w) => s + w.duration, 0)

    expect(totalWindowDuration).toBeCloseTo(totalSegDuration, 10)
  })

  test('windows are contiguous with no gaps', () => {
    const segments = [
      { pts_time: 0, duration: 7 },
      { pts_time: 7, duration: 8 },
      { pts_time: 15, duration: 6 },
      { pts_time: 21, duration: 9 },
      { pts_time: 30, duration: 5 },
    ]

    const windows = SubtitleSegmenter.computeWindows(segments)

    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].start).toBe(windows[i - 1].end)
    }
  })

  test('firstVideoSegment points to the first segment in each window', () => {
    const segments = [
      { pts_time: 0, duration: 10 },
      { pts_time: 10, duration: 10 },
      { pts_time: 20, duration: 10 },
      { pts_time: 30, duration: 10 },
    ]

    const windows = SubtitleSegmenter.computeWindows(segments)

    expect(windows[0].firstVideoSegment).toBe(0)
    expect(windows[1].firstVideoSegment).toBe(2)
  })
})

describe('SubtitleSegmenter.generateVtt', () => {
  test('generates valid VTT with correct MPEGTS offset and LOCAL time', () => {
    const cues = SubtitleSegmenter.prepareCues(SRT, 0)
    const mpegtsOffset = Math.round(1.483 * 90000)

    const vtt = SubtitleSegmenter.generateVtt({
      cues,
      windowStart: 0,
      windowEnd: 20,
      mpegtsOffset,
    })

    expect(vtt).toStartWith('WEBVTT\n')
    expect(vtt).toContain(
      `X-TIMESTAMP-MAP=MPEGTS:${mpegtsOffset},LOCAL:00:00:00.000`
    )
  })

  test('includes cues that overlap the window (RFC 8216 boundary spanning)', () => {
    const srt = `1
00:00:05,000 --> 00:00:15,000
Spans boundary
`

    const cues = SubtitleSegmenter.prepareCues(srt, 0)

    const vtt1 = SubtitleSegmenter.generateVtt({
      cues,
      windowStart: 0,
      windowEnd: 10,
      mpegtsOffset: 0,
    })

    const vtt2 = SubtitleSegmenter.generateVtt({
      cues,
      windowStart: 10,
      windowEnd: 20,
      mpegtsOffset: 0,
    })

    expect(vtt1).toContain('Spans boundary')
    expect(vtt2).toContain('Spans boundary')
  })

  test('excludes cues fully outside the window', () => {
    const cues = SubtitleSegmenter.prepareCues(SRT, 0)

    const vtt = SubtitleSegmenter.generateVtt({
      cues,
      windowStart: 5,
      windowEnd: 10,
      mpegtsOffset: 0,
    })

    expect(vtt).not.toContain('Hello world')
    expect(vtt).toContain('Second line')
    expect(vtt).not.toContain('Third line')
  })

  test('empty window produces VTT with only headers', () => {
    const cues = SubtitleSegmenter.prepareCues(SRT, 0)

    const vtt = SubtitleSegmenter.generateVtt({
      cues,
      windowStart: 50,
      windowEnd: 70,
      mpegtsOffset: 0,
    })

    expect(vtt).toStartWith('WEBVTT\n')
    expect(vtt).toContain('X-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:50.000')
    expect(vtt).not.toContain('Hello world')
    expect(vtt).not.toContain('Second line')
    expect(vtt).not.toContain('Third line')
  })

  test('LOCAL timestamp matches windowStart', () => {
    const cues = SubtitleSegmenter.prepareCues(SRT, 0)

    const vtt = SubtitleSegmenter.generateVtt({
      cues,
      windowStart: 20,
      windowEnd: 40,
      mpegtsOffset: 0,
    })

    expect(vtt).toContain('LOCAL:00:00:20.000')
  })

  test('VTT timestamps use HH:MM:SS.mmm format', () => {
    const srt = `1
01:02:03,456 --> 01:02:05,789
Formatted
`

    const cues = SubtitleSegmenter.prepareCues(srt, 0)

    const vtt = SubtitleSegmenter.generateVtt({
      cues,
      windowStart: 0,
      windowEnd: 7200,
      mpegtsOffset: 0,
    })

    expect(vtt).toContain('01:02:03.456')
    expect(vtt).toContain('01:02:05.789')
  })

  test('cues are sorted by start time in output', () => {
    const srt = `1
00:01:09,000 --> 00:01:12,000
Late cue

2
00:00:24,000 --> 00:00:27,000
Early cue
`

    const cues = SubtitleSegmenter.prepareCues(srt, 0)

    const vtt = SubtitleSegmenter.generateVtt({
      cues,
      windowStart: 0,
      windowEnd: 120,
      mpegtsOffset: 0,
    })

    const earlyIdx = vtt.indexOf('Early cue')
    const lateIdx = vtt.indexOf('Late cue')

    expect(earlyIdx).toBeGreaterThan(-1)
    expect(lateIdx).toBeGreaterThan(-1)
    expect(earlyIdx).toBeLessThan(lateIdx)
  })
})

describe('SubtitleSegmenter.buildSubtitlePlaylist', () => {
  test('produces valid HLS playlist from windows', () => {
    const windows = [
      { start: 0, end: 20, duration: 20, firstVideoSegment: 0 },
      { start: 20, end: 30, duration: 10, firstVideoSegment: 4 },
    ]

    const playlist = SubtitleSegmenter.buildSubtitlePlaylist(windows)

    expect(playlist).toContain('#EXTM3U')
    expect(playlist).toContain('#EXT-X-VERSION:3')
    expect(playlist).toContain('#EXT-X-TARGETDURATION:20')
    expect(playlist).toContain('#EXT-X-PLAYLIST-TYPE:VOD')
    expect(playlist).toContain('#EXTINF:20.000000,')
    expect(playlist).toContain('subs_000.vtt')
    expect(playlist).toContain('#EXTINF:10.000000,')
    expect(playlist).toContain('subs_001.vtt')
    expect(playlist).toContain('#EXT-X-ENDLIST')
  })
})
