import axios from 'redaxios'

import type {
  DownloadClient,
  TorrentStatus,
} from '@/integrations/download-client'
import { Log } from '@/lib/log'

interface QBitTorrent {
  hash: string
  progress: number
  dlspeed: number
  eta: number
  state: string
  content_path: string
}

const stateMap: Record<string, TorrentStatus['status']> = {
  downloading: 'downloading',
  stalledDL: 'downloading',
  forcedDL: 'downloading',
  queuedDL: 'downloading',
  checkingDL: 'downloading',
  uploading: 'seeding',
  stalledUP: 'seeding',
  forcedUP: 'seeding',
  queuedUP: 'seeding',
  checkingUP: 'seeding',
  pausedDL: 'paused',
  pausedUP: 'paused',
  stoppedDL: 'paused',
  stoppedUP: 'paused',
  error: 'error',
  missingFiles: 'error',
}

export class QBittorrentClient implements DownloadClient {
  private cookie: string | null = null

  constructor(
    private config: {
      url: string
      username: string
      password: string
      category: string
    }
  ) {}

  private async login() {
    Log.info(`qbittorrent login attempt url=${this.config.url}`)

    const response = await fetch(`${this.config.url}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(this.config.username)}&password=${encodeURIComponent(this.config.password)}`,
    })

    const sid = response.headers
      .getSetCookie()
      .find((c) => c.startsWith('SID='))
      ?.match(/SID=([^;]+)/)?.[1]

    if (!sid) {
      Log.error(`qbittorrent login failed url=${this.config.url}`)
      throw new Error('qBittorrent login failed')
    }

    this.cookie = sid
    Log.info('qbittorrent login success')
  }

  private async request<T>(options: {
    method: 'GET' | 'POST'
    url: string
    data?: unknown
    params?: Record<string, unknown>
  }) {
    if (!this.cookie) {
      await this.login()
    }

    Log.info(`qbittorrent request ${options.method} ${options.url}`)

    const { data } = await axios<T>({
      ...options,
      baseURL: this.config.url,
      headers: { Cookie: `SID=${this.cookie}` },
    }).catch((e) => {
      Log.error(
        `qbittorrent request failed ${options.method} ${options.url} status=${e.status} statusText="${e.statusText}"`
      )

      throw new Error(`qBittorrent ${e.status}: ${e.statusText}`)
    })

    if (data === 'Fails.') {
      Log.error(`qbittorrent request rejected ${options.method} ${options.url}`)

      throw new Error(`qBittorrent rejected: ${options.method} ${options.url}`)
    }

    return data
  }

  getTorrentStatuses: DownloadClient['getTorrentStatuses'] = async () => {
    const torrents = await this.request<QBitTorrent[]>({
      method: 'GET',
      url: '/api/v2/torrents/info',
      params: { category: this.config.category },
    })

    return torrents.map((t) => {
      const status = stateMap[t.state]

      if (!status) {
        Log.warn(`qbittorrent unknown state="${t.state}" hash=${t.hash}`)
      }

      return {
        hash: t.hash.toLowerCase(),
        progress: t.progress,
        speed: t.dlspeed,
        eta: t.eta,
        status: status ?? 'error',
        content_path: t.content_path,
      }
    })
  }

  addTorrent: DownloadClient['addTorrent'] = async (params) => {
    const form = new FormData()

    form.append('urls', params.url)
    form.append('category', this.config.category)

    await this.request({
      method: 'POST',
      url: '/api/v2/torrents/add',
      data: form,
    }).catch((e) => {
      Log.error(
        `qbittorrent addTorrent failed url=${params.url} reason="${e.message}"`
      )

      throw new Error('Torrent rejected by qBittorrent', { cause: e })
    })
  }
}
