export interface DownloadData {
  source_id: string
  download_url: string
  title: string
  year: number | null
  imdb_id: string
  media_id: string
  tracks_dir: string
  audio_only?: boolean
  language?: string | null
  season_number?: number | null
  episode_number?: number | null
}

export interface DownloadResult {
  media_id: string
  download_id: number
  title: string
  year: number | null
}

export interface DownloadSource {
  enqueue(data: DownloadData): Promise<DownloadResult>
}
