import { DbSearchResults } from '@/db/search-results'
import { TmdbClient } from '@/integrations/tmdb/client'

export const Search = {
  async search(query: string) {
    const tmdbResults = await new TmdbClient().search(query)

    const results = await DbSearchResults.upsert(tmdbResults)

    const tmdbMap = new Map(
      tmdbResults.map((t) => [`${t.tmdb_id}:${t.media_type}`, t])
    )

    return results.map((r) => {
      const tmdbMatch = tmdbMap.get(`${r.tmdb_id}:${r.media_type}`)

      return {
        ...r,
        poster_path: tmdbMatch?.poster_path ?? null,
        overview: tmdbMatch?.overview ?? null,
      }
    })
  },
}
