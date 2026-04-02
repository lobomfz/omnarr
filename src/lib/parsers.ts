const patterns = {
  sxxexx: /s(\d+)\.?e(\d+)/i,
  nxnn: /(?<!\d)(\d{1,2})x(\d+)/i,
  seasonOnly: /(?:^|[.\s])s(\d+)(?:[.\s]|$)/i,
  seasonWord: /season[.\s]?(\d+)/i,
}

const TECHNICAL_KEYWORD =
  /(?:^|[\s._])(\d{3,4}p|blu-?ray|bdrip|brrip|web-?dl|webrip|webdl|hdtv|dvdrip|x264|x265|h\.?264|h\.?265|hevc|avc|xvid)/i

const SOURCE_PATTERN =
  /(?:^|[\s._])(blu-?ray|bdrip|brrip|web-?dl|webrip|webdl|hdtv|dvdrip)(?:[\s._-]|$)/i

const COMPOUND_SOURCE_HYPHEN = /(?:^|[\s._])(blu-ray|web-dl)(?:[\s._-]|$)/gi

export const Parsers = {
  technicalPart(name: string) {
    const match = TECHNICAL_KEYWORD.exec(name)

    if (!match) {
      return name
    }

    const keywordStart = match.index! + match[0].indexOf(match[1]!)

    return name.slice(keywordStart)
  },

  releaseName(name: string) {
    const sourceMatch = SOURCE_PATTERN.exec(name)
    const source = sourceMatch?.[1] ?? null

    const knownHyphenPositions = new Set<number>()

    for (const m of name.matchAll(COMPOUND_SOURCE_HYPHEN)) {
      const matchStart = m[1] ? m.index! + m[0].indexOf(m[1]) : m.index!
      knownHyphenPositions.add(matchStart + 3)
    }

    let group: string | null = null

    for (let i = name.length - 1; i >= 0; i--) {
      if (name[i] === '-' && !knownHyphenPositions.has(i)) {
        const after = name.slice(i + 1)

        if (/^[a-z0-9]+$/i.test(after)) {
          group = after
        }

        break
      }
    }

    return { group, source }
  },

  srtTimestamps(content: string) {
    const pattern =
      /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/g

    const pairs: number[] = []
    let match

    while ((match = pattern.exec(content)) !== null) {
      const start =
        +match[1]! * 3600 + +match[2]! * 60 + +match[3]! + +match[4]! / 1000
      const end =
        +match[5]! * 3600 + +match[6]! * 60 + +match[7]! + +match[8]! / 1000

      pairs.push(start, end)
    }

    return new Float32Array(pairs)
  },

  seasonEpisode(name: string) {
    for (const pattern of Object.values(patterns)) {
      const match = pattern.exec(name)

      if (!match) {
        continue
      }

      const hasEpisode = match[2] !== undefined

      return {
        season_number: Number(match[1]),
        episode_number: hasEpisode ? Number(match[2]) : null,
      }
    }

    return { season_number: null, episode_number: null }
  },
}
