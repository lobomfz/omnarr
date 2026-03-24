import axios from 'redaxios'

import { envVariables } from '@/env'

import type { Indexer, IndexerRelease, SearchParams } from './types'
import type { PromptApi } from '@bunli/core'

interface YtsTorrent {
  hash: string
  quality: string
  type: string
  video_codec: string
  seeds: number
  size_bytes: number
}

interface YtsMovie {
  title: string
  year: number
  imdb_code: string
  torrents: YtsTorrent[]
}

interface YtsResponse {
  data: {
    movies?: YtsMovie[]
  }
}

export class YtsAdapter implements Indexer {
  name = 'YTS'

  static promptConfig(_prompt: PromptApi) {
    return Promise.resolve({ type: 'yts' as const })
  }

  async search(params: SearchParams) {
    const { data } = await axios<YtsResponse>({
      method: 'GET',
      baseURL: envVariables.YTS_API_URL,
      url: '/list_movies.json',
      params: {
        query_term: params.imdb_id,
        limit: 50,
      },
    })

    if (!data.data.movies) return []

    return data.data.movies.flatMap((movie) =>
      movie.torrents.map((t): IndexerRelease => ({
        torrent_id: t.hash,
        info_hash: t.hash.toLowerCase(),
        name: `${movie.title} (${movie.year}) [${t.quality}] [${t.type}] [${t.video_codec}]`,
        size: t.size_bytes,
        seeders: t.seeds,
        imdb_id: movie.imdb_code,
        resolution: t.quality.toLowerCase(),
        codec: t.video_codec,
        hdr: [],
        download_url: `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title)}`,
      })),
    )
  }
}
