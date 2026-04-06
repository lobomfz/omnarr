import { type } from '@lobomfz/db'
import axios from 'redaxios'

import { envVariables } from '@/lib/env'
import { Log } from '@/lib/log'

import type { Indexer } from './types'

interface PageData {
  contentId: string
  csrfToken: string
  pageToken: string
  contentType: string
  optionsUrl: string
  sourceUrl: string
}

const superflixEpisode = type({
  ID: 'number',
  epi_num: 'number',
  title: 'string',
  season: 'number',
})

export class SuperflixAdapter implements Indexer {
  static schema = type({ type: "'superflix'" })

  static name = 'Superflix'

  static types: ('movie' | 'tv')[] = ['movie', 'tv']

  static source = 'ripper' as const

  private base = envVariables.SUPERFLIX_API_URL

  search: Indexer['search'] = async (params) => {
    if (!params.imdb_id) {
      return []
    }

    if (params.season_number !== undefined) {
      return await this.searchTv(params.imdb_id, params.season_number)
    }

    return await this.searchMovie(params.imdb_id)
  }

  private async searchMovie(imdbId: string) {
    const page = await this.getPageData(imdbId).catch((err) => {
      Log.warn(
        `superflix: page fetch failed imdb=${imdbId} error="${err.message}"`
      )
      return null
    })

    if (!page) {
      return []
    }

    const videoId = await this.getVideoId(page)
    const player = await this.getPlayer(videoId, page)
    const masterPlaylist = await this.getMasterPlaylist(player)

    const audioStreams = this.extractAudioStreams(masterPlaylist, '')

    if (audioStreams.length === 0) {
      return []
    }

    const resolution = this.extractResolution(masterPlaylist)
    const size = await this.estimateSize(masterPlaylist, player.url)

    return [
      {
        source_id: `superflix:${imdbId}`,
        name: null,
        size,
        imdb_id: imdbId,
        resolution,
        codec: null,
        hdr: [],
        download_url: `imdb:${imdbId}`,
      },
    ]
  }

  private async searchTv(imdbId: string, season: number) {
    const episodes = await this.getEpisodeList(imdbId, season).catch((err) => {
      Log.warn(
        `superflix: episode list failed imdb=${imdbId} error="${err.message}"`
      )
      return []
    })

    if (episodes.length === 0) {
      return []
    }

    const page = await this.getPageData(imdbId, {
      season,
      episode: episodes[0].epi_num,
    }).catch((err) => {
      Log.warn(
        `superflix: tv page fetch failed imdb=${imdbId} season=${season} error="${err.message}"`
      )
      return null
    })

    if (!page) {
      return []
    }

    const videoId = await this.getVideoId(page)
    const player = await this.getPlayer(videoId, page)
    const masterPlaylist = await this.getMasterPlaylist(player)

    const resolution = this.extractResolution(masterPlaylist)
    const episodeSize = await this.estimateSize(masterPlaylist, player.url)

    return [
      {
        source_id: `superflix:${imdbId}:${season}`,
        name: null,
        size: episodeSize * episodes.length,
        imdb_id: imdbId,
        resolution,
        codec: null,
        hdr: [],
        download_url: `imdb:${imdbId}`,
      },
    ]
  }

  async getEpisodeList(imdbId: string, season: number) {
    const { data } = await axios<string>({
      url: `${this.base}/serie/${imdbId}`,
      headers: { 'Sec-Fetch-Dest': 'iframe' },
    })

    const allEpisodes = this.parseAllEpisodes(data, imdbId)
    const seasonEpisodes = allEpisodes[String(season)]

    if (!seasonEpisodes || seasonEpisodes.length === 0) {
      return []
    }

    return superflixEpisode.array().assert(seasonEpisodes)
  }

  private parseAllEpisodes(html: string, imdbId: string) {
    const match = html.match(/ALL_EPISODES\s*=\s*(.+);/)

    if (!match) {
      throw new Error(`Superflix: ALL_EPISODES not found for IMDB ${imdbId}`)
    }

    try {
      return JSON.parse(match[1]) as Record<string, unknown[]>
    } catch {
      throw new Error(`Superflix: ALL_EPISODES parse failed for IMDB ${imdbId}`)
    }
  }

  private async getPageData(
    imdbId: string,
    episode?: { season: number; episode: number }
  ) {
    const path = episode
      ? `/serie/${imdbId}/${episode.season}/${episode.episode}`
      : `/filme/${imdbId}`

    const { data } = await axios<string>({
      url: `${this.base}${path}`,
      headers: { 'Sec-Fetch-Dest': 'iframe' },
    })

    const contentId = data.match(/INITIAL_CONTENT_ID\s*=\s*(\d+)/)?.[1]
    const csrfToken = data.match(/CSRF_TOKEN\s*=\s*"([^"]+)"/)?.[1]
    const pageToken = data.match(/PAGE_TOKEN\s*=\s*"([^"]+)"/)?.[1]
    const contentType = data.match(/CONTENT_TYPE\s*=\s*"([^"]+)"/)?.[1]
    const optionsUrl = data.match(/API_URL_OPTIONS\s*=\s*"([^"]+)"/)?.[1]
    const sourceUrl = data.match(/API_URL_SOURCE\s*=\s*"([^"]+)"/)?.[1]

    if (
      !contentId ||
      !csrfToken ||
      !pageToken ||
      !contentType ||
      !optionsUrl ||
      !sourceUrl
    ) {
      throw new Error(`Superflix: page data not found for IMDB ${imdbId}`)
    }

    return {
      contentId,
      csrfToken,
      pageToken,
      contentType,
      optionsUrl,
      sourceUrl,
    }
  }

  private async getVideoId(page: PageData) {
    const { data } = await axios<{ data: { options: { ID: number }[] } }>({
      method: 'post',
      url: page.optionsUrl,
      data: new URLSearchParams({
        contentid: page.contentId,
        type: page.contentType,
        _token: page.csrfToken,
        page_token: page.pageToken,
        pageToken: page.pageToken,
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Page-Token': page.pageToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        Referer: `${this.base}/`,
      },
    })

    const videoId = data.data.options[0]?.ID

    if (!videoId) {
      throw new Error('Superflix: no video options available')
    }

    return String(videoId)
  }

  private async getPlayer(videoId: string, page: PageData) {
    const { data } = await axios<{ data: { video_url: string } }>({
      method: 'post',
      url: page.sourceUrl,
      data: new URLSearchParams({
        video_id: videoId,
        page_token: page.pageToken,
        _token: page.csrfToken,
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        Referer: `${this.base}/`,
      },
    })

    const redirectUrl = data.data.video_url

    const res = await fetch(redirectUrl, { redirect: 'follow' })
    await res.text()

    const parsed = new URL(res.url)

    return {
      url: res.url,
      origin: parsed.origin,
      hash: parsed.pathname.split('/').pop()!,
    }
  }

  private async getMasterPlaylist(player: {
    url: string
    origin: string
    hash: string
  }) {
    const { data: videoData } = await axios<{ videoSource: string }>({
      method: 'post',
      url: `${player.origin}/player/index.php?data=${player.hash}&do=getVideo`,
      data: new URLSearchParams({
        hash: player.hash,
        r: `${this.base}/`,
      }).toString(),
      headers: {
        Referer: player.url,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    const { data: playlist } = await axios<string>({
      url: videoData.videoSource,
      headers: { Referer: player.url },
    })

    return playlist
  }

  private async estimateSize(masterPlaylist: string, referer: string) {
    const bandwidth = masterPlaylist.match(/BANDWIDTH=(\d+)/)?.[1]
    const videoStream = this.extractVideoStream(masterPlaylist, referer)

    if (!bandwidth || !videoStream) {
      Log.warn(
        'superflix: cannot estimate size, missing bandwidth or video stream'
      )
      return 0
    }

    const { data: playlist } = await axios<string>({
      url: videoStream.url,
      headers: { Referer: referer },
    }).catch((err) => {
      Log.warn(
        `superflix: size estimate failed url="${videoStream.url}" error="${err.message}"`
      )
      return { data: '' }
    })

    let duration = 0

    for (const line of playlist.split('\n')) {
      if (line.startsWith('#EXTINF:')) {
        duration += parseFloat(line.slice(8))
      }
    }

    return Math.round((Number(bandwidth) * duration) / 8)
  }

  private extractResolution(masterPlaylist: string) {
    const match = masterPlaylist.match(/RESOLUTION=(\d+)x(\d+)/)

    if (!match) {
      return null
    }

    return `${match[2]}p`
  }

  private extractVideoStream(masterPlaylist: string, referer: string) {
    const lines = masterPlaylist.split('\n')

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('#EXT-X-STREAM-INF')) {
        const url = lines[i + 1]?.trim()

        if (url && !url.startsWith('#')) {
          return { url, referer }
        }
      }
    }

    return null
  }

  private extractAudioStreams(masterPlaylist: string, referer: string) {
    const streams: { lang: string | null; url: string; referer: string }[] = []

    for (const line of masterPlaylist.split('\n')) {
      if (line.includes('TYPE=AUDIO')) {
        const raw = line.match(/LANGUAGE="([^"]+)"/)?.[1]
        const url = line.match(/URI="([^"]+)"/)?.[1]
        const lang = raw && raw !== 'und' ? raw : null

        if (url) {
          streams.push({ lang, url, referer })
        }
      }
    }

    return streams
  }

  async getStreams(
    imdbId: string,
    episode?: { season: number; episode: number }
  ) {
    const page = await this.getPageData(imdbId, episode)

    const videoId = await this.getVideoId(page)

    const player = await this.getPlayer(videoId, page)

    const masterPlaylist = await this.getMasterPlaylist(player)

    return {
      video: this.extractVideoStream(masterPlaylist, player.url),
      audio: this.extractAudioStreams(masterPlaylist, player.url),
    }
  }

  async downloadStream(
    stream: { url: string; referer: string },
    outputPath: string,
    onProgress: (downloaded: number, total: number) => void | Promise<void>
  ) {
    const { data: playlist } = await axios<string>({
      url: stream.url,
      headers: { Referer: stream.referer },
    })

    const chunks = playlist
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))

    const writer = Bun.file(outputPath).writer()

    const concurrency = 20

    let downloaded = 0

    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency)

      const buffers = await Promise.all(
        batch.map(async (url) => {
          const { data } = await axios<ArrayBuffer>({
            url,
            headers: { Referer: stream.referer },
            responseType: 'arrayBuffer',
          })

          return Buffer.from(data)
        })
      )

      for (const buf of buffers) {
        writer.write(buf)
      }

      downloaded += batch.length

      await onProgress(downloaded, chunks.length)
    }

    await writer.end()
  }
}
