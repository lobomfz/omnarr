const patterns = {
  sxxexx: /s(\d+)\.?e(\d+)/i,
  nxnn: /(?<!\d)(\d{1,2})x(\d+)/i,
  seasonOnly: /(?:^|[.\s])s(\d+)(?:[.\s]|$)/i,
  seasonWord: /season[.\s]?(\d+)/i,
}

export const Parsers = {
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
