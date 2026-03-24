import type { download_status } from '@/db/connection'

export interface TorrentStatus {
  hash: string
  progress: number
  speed: number
  eta: number
  status: download_status
}

export interface DownloadClient {
  addTorrent(params: { url: string; savepath?: string }): Promise<void>
  getTorrentStatuses(): Promise<TorrentStatus[]>
}
