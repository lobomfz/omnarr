import type { download_status } from '@/db/connection'

export interface TorrentStatus {
  hash: string
  progress: number
  speed: number
  eta: number
  status: download_status
  content_path: string
}

export interface DownloadClient {
  addTorrent(params: { url: string; hash: string }): Promise<void>
  getTorrentStatuses(): Promise<TorrentStatus[]>
}
