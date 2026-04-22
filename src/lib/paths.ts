import { Formatters } from '@/lib/formatters'

export const Paths = {
  seasonEpisodeDir(
    seasonNumber: number | null | undefined,
    episodeNumber: number | null | undefined
  ) {
    return Formatters.seasonEpisodeTag(
      seasonNumber,
      episodeNumber
    ).toLowerCase()
  },

  subtitleFile(language: string | null | undefined, sourceHash: string) {
    const lang = Formatters.language(language) ?? 'unknown'

    return `sub_${lang}_${sourceHash}.srt`
  },
}
