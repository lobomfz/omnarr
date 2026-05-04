export interface TmdbTypes {
  raw_media: {
    id: number
    title?: string
    name?: string
    overview: string
    poster_path: string | null
    backdrop_path: string | null
    release_date?: string
    first_air_date?: string
    media_type?: 'movie' | 'tv'
    runtime?: number | null
    episode_run_time?: number[]
    vote_average?: number
    genres?: { id: number; name: string }[]
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
