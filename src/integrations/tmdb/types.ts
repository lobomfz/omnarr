export interface TmdbTypes {
  raw_media: {
    id: number
    title?: string
    name?: string
    overview: string
    poster_path: string | null
    release_date?: string
    first_air_date?: string
    media_type?: 'movie' | 'tv'
    seasons?: {
      season_number: number
      name: string
      episode_count: number
    }[]
  }
  search_response: {
    page: number
    results: TmdbTypes['raw_media'][]
    total_pages: number
    total_results: number
  }
  media: {
    tmdb_id: number
    media_type: 'movie' | 'tv'
    title: string
    year: number | null
    overview: string
    poster_path: string | null
  }
  external_ids: {
    imdb_id: string | null
  }
  season_response: {
    episodes: {
      episode_number: number
      name: string
    }[]
  }
}
