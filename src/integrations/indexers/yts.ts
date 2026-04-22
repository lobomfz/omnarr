import { type } from '@lobomfz/db'
import axios from 'redaxios'

import { envVariables } from '@/lib/env'
import { Parsers } from '@/lib/parsers'

import type { Indexer, IndexerRelease, SearchParams } from './types'

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
  static schema = type({ type: "'yts'" })

  static name = 'YTS'

  static types: ('movie' | 'tv')[] = ['movie']

  static source = 'torrent' as const

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

    if (!data.data.movies) {
      return []
    }

    return data.data.movies.flatMap((movie) =>
      movie.torrents.map(
        (t): IndexerRelease => ({
          source_id: t.hash,
          name: `${movie.title} (${movie.year}) [${t.quality}] [${t.type}] [${t.video_codec}]`,
          size: t.size_bytes,
          seeders: t.seeds,
          imdb_id: movie.imdb_code,
          resolution: Parsers.releaseResolution(t.quality),
          codec: Parsers.releaseCodec(t.video_codec),
          hdr: [],
          download_url: `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title)}`,
        })
      )
    )
  }
}
