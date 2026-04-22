import { Tmdb } from '@/core/tmdb'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbSearchResults } from '@/db/search-results'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { TmdbClient } from '@/integrations/tmdb/client'
import { OmnarrError } from '@/shared/errors'

export class MediaResolver {
  constructor(
    private input: { id: string; season?: number; episode?: number }
  ) {}

  async resolve() {
    await this.assertMedia()

    const media = await DbMedia.getWithDetails(this.input.id, this.input)
    const active_scan =
      media.tmdb_media_id === null
        ? null
        : await DbMediaFiles.getActiveScan(media.id)

    return { ...media, active_scan }
  }

  async assertMedia() {
    const existing = await DbMedia.getByDerivedId(this.input.id)

    if (existing) {
      if (existing.media_type === 'tv') {
        await Tmdb.fetchSeasons(existing.tmdb_id)
      }

      return
    }

    const searchResult = await DbSearchResults.getById(this.input.id)

    if (!searchResult) {
      throw new OmnarrError('SEARCH_RESULT_NOT_FOUND')
    }

    const details = await new TmdbClient().getDetails(
      searchResult.tmdb_id,
      searchResult.media_type
    )

    await DbTmdbMedia.upsert({
      tmdb_id: details.tmdb_id,
      media_type: details.media_type,
      title: details.title,
      year: details.year,
      overview: details.overview,
      poster_path: details.poster_path,
      backdrop_path: details.backdrop_path,
      runtime: details.runtime,
      vote_average: details.vote_average,
      genres: details.genres,
      imdb_id: details.imdb_id,
    })

    if (searchResult.media_type === 'tv') {
      await Tmdb.fetchSeasons(searchResult.tmdb_id)
    }
  }
}
