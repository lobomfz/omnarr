export type SubtitleCue = {
  start: number
  end: number
  text: string
}

export type SubtitleWindow = {
  start: number
  end: number
  duration: number
  firstVideoSegment: number
}

type GenerateVttInput = {
  cues: SubtitleCue[]
  windowStart: number
  windowEnd: number
  mpegtsOffset: number
}

const CUE_PATTERN =
  /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n?$)/g

const SUBTITLE_WINDOW_TARGET = 20

function parseTimestamp(h: string, m: string, s: string, ms: string) {
  return +h * 3600 + +m * 60 + +s + +ms / 1000
}

function formatTimestamp(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const whole = Math.floor(s)
  const ms = Math.round((s - whole) * 1000)

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export const SubtitleSegmenter = {
  parseSrt(srt: string): SubtitleCue[] {
    const cues: SubtitleCue[] = []
    let match

    while ((match = CUE_PATTERN.exec(srt)) !== null) {
      cues.push({
        start: parseTimestamp(match[1], match[2], match[3], match[4]),
        end: parseTimestamp(match[5], match[6], match[7], match[8]),
        text: match[9].trim(),
      })
    }

    CUE_PATTERN.lastIndex = 0

    return cues
  },

  prepareCues(srt: string, offset: number): SubtitleCue[] {
    const cues = SubtitleSegmenter.parseSrt(srt)

    return cues
      .map((c) => ({
        start: Math.max(0, c.start + offset),
        end: Math.max(0, c.end + offset),
        text: c.text,
      }))
      .sort((a, b) => a.start - b.start)
  },

  computeWindows(
    segments: { pts_time: number; duration: number }[]
  ): SubtitleWindow[] {
    const windows: SubtitleWindow[] = []
    let windowStart = segments[0].pts_time
    let accumulated = 0
    let firstVideoSegment = 0

    for (let i = 0; i < segments.length; i++) {
      accumulated += segments[i].duration

      if (accumulated >= SUBTITLE_WINDOW_TARGET || i === segments.length - 1) {
        windows.push({
          start: windowStart,
          end: windowStart + accumulated,
          duration: accumulated,
          firstVideoSegment,
        })

        windowStart += accumulated
        firstVideoSegment = i + 1
        accumulated = 0
      }
    }

    return windows
  },

  generateVtt(input: GenerateVttInput) {
    const header = `WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:${input.mpegtsOffset},LOCAL:${formatTimestamp(input.windowStart)}`

    const overlapping = input.cues.filter(
      (c) => c.start < input.windowEnd && c.end > input.windowStart
    )

    let vtt = header

    for (const cue of overlapping) {
      vtt += `\n\n${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${cue.text}`
    }

    return vtt
  },

  buildSubtitlePlaylist(windows: SubtitleWindow[]) {
    const maxDuration = Math.ceil(Math.max(...windows.map((w) => w.duration)))

    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${maxDuration}`,
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXT-X-MEDIA-SEQUENCE:0',
    ]

    for (let i = 0; i < windows.length; i++) {
      lines.push(`#EXTINF:${windows[i].duration.toFixed(6)},`)
      lines.push(`subs_${String(i).padStart(3, '0')}.vtt`)
    }

    lines.push('#EXT-X-ENDLIST')

    return lines.join('\n')
  },
}
