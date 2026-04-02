export interface DownloadData {
  source_id: string
  download_url: string
  title: string
  year: number | null
  imdb_id: string
  media_id: string
  tracksDir: string
  audio_only?: boolean
  lang?: string
  language?: string | null
  season_number?: number | null
  episode_number?: number | null
  concurrency?: number | null
}

export interface DownloadSource {
  onProgress: (tag: string, status: string, progress: number) => void

  add(data: DownloadData): Promise<{ title: string; year: number | null }>
}
