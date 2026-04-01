const patterns = {
  sxxexx: /s(\d+)\.?e(\d+)/i,
  nxnn: /(?<!\d)(\d{1,2})x(\d+)/i,
  seasonOnly: /(?:^|[.\s])s(\d+)(?:[.\s]|$)/i,
  seasonWord: /season[.\s]?(\d+)/i,
}

export const Parsers = {
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
