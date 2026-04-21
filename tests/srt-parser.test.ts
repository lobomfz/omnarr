import { describe, expect, test } from 'bun:test'

import { Parsers } from '@/lib/parsers'

describe('Parsers.srtTimestamps', () => {
  test('parses standard SRT content into Float32Array pairs', () => {
    const srt = `1
00:00:01,500 --> 00:00:04,000
Hello world

2
00:01:30,200 --> 00:01:35,800
Second line
`

    const result = Parsers.srtTimestamps(srt)

    expect(result).toBeInstanceOf(Float32Array)
    expect(result.length).toBe(4)

    expect(result[0]).toBeCloseTo(1.5, 3)
    expect(result[1]).toBeCloseTo(4.0, 3)
    expect(result[2]).toBeCloseTo(90.2, 3)
    expect(result[3]).toBeCloseTo(95.8, 3)
  })

  test('handles hours correctly', () => {
    const srt = `1
01:30:45,123 --> 02:15:30,456
Text
`

    const result = Parsers.srtTimestamps(srt)

    expect(result.length).toBe(2)
    expect(result[0]).toBeCloseTo(3600 + 30 * 60 + 45 + 0.123, 3)
    expect(result[1]).toBeCloseTo(2 * 3600 + 15 * 60 + 30 + 0.456, 3)
  })

  test('returns empty Float32Array for empty content', () => {
    const result = Parsers.srtTimestamps('')

    expect(result).toBeInstanceOf(Float32Array)
    expect(result.length).toBe(0)
  })

  test('returns empty Float32Array for content without timestamps', () => {
    const result = Parsers.srtTimestamps('just some text\nno timestamps here')

    expect(result.length).toBe(0)
  })

  test('result length is always even', () => {
    const srt = `1
00:00:00,000 --> 00:00:01,000
A

2
00:00:02,000 --> 00:00:03,000
B

3
00:00:04,000 --> 00:00:05,000
C
`

    const result = Parsers.srtTimestamps(srt)

    expect(result.length).toBe(6)
    expect(result.length % 2).toBe(0)
  })

  test('timestamps are in ascending order (start < end per pair)', () => {
    const srt = `1
00:00:10,000 --> 00:00:15,000
Text

2
00:00:20,000 --> 00:00:25,000
Text
`

    const result = Parsers.srtTimestamps(srt)

    for (let i = 0; i < result.length; i += 2) {
      expect(result[i]).toBeLessThan(result[i + 1])
    }
  })
})
