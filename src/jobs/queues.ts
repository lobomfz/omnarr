import { Queue } from '@/jobs/index'

export interface ScanJobData {
  media_id: string
  force?: boolean
}

export interface RipperJobData {
  media_id: string
  download_id: number
  source_id: string
  imdb_id: string
  title: string
  tracks_dir: string
  audio_only?: boolean
  season_number?: number | null
  episode_number?: number | null
}

export interface SubtitleMatchJobData {
  media_id: string
  episode_id?: number
  lang?: string
  season?: number
  episode?: number
}

export const scanQueue = new Queue<ScanJobData>('scan')
export const ripperQueue = new Queue<RipperJobData>('ripper')
export const subtitleMatchQueue = new Queue<SubtitleMatchJobData>(
  'subtitle-match'
)
