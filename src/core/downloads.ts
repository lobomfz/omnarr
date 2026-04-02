import { join } from 'path'

import { RipperDownload } from '@/core/ripper-download'
import { SubtitleDownload } from '@/core/subtitle-download'
import { TorrentDownload } from '@/core/torrent-download'
import { DbMedia } from '@/db/media'
import type { Release } from '@/db/releases'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { indexerMap } from '@/integrations/indexers/registry'
import { TmdbClient } from '@/integrations/tmdb/client'
import { config } from '@/lib/config'
import { deriveId } from '@/lib/utils'

import type { DownloadData } from './types/download-source'

export class Downloads {
  async add(
    release: Release,
    onProgress: (tag: string, status: string, progress: number) => void,
    opts?: {
      audio_only?: boolean
      lang?: string
      concurrency?: number
    }
  ) {
    const details = await new TmdbClient().getDetails(
      release.tmdb_id,
      release.media_type
    )

    const tmdbMedia = await DbTmdbMedia.upsert({
      tmdb_id: details.tmdb_id,
      media_type: details.media_type,
      title: details.title,
      year: details.year,
      overview: details.overview,
      poster_path: details.poster_path,
      imdb_id: details.imdb_id,
    })

    const rootFolder = config.root_folders?.[details.media_type]

    if (!rootFolder) {
      throw new Error(`No root folder configured for ${details.media_type}`)
    }

    const media = await DbMedia.create({
      id: deriveId(`${details.tmdb_id}:${details.media_type}`),
      tmdb_media_id: tmdbMedia.id,
      media_type: details.media_type,
      root_folder: rootFolder,
    })

    const data: DownloadData = {
      source_id: release.source_id,
      download_url: release.download_url,
      title: details.title,
      year: details.year,
      imdb_id: details.imdb_id,
      media_id: media.id,
      tracksDir: this.resolveTracksDir(media.id),
      audio_only: opts?.audio_only,
      lang: opts?.lang,
      language: release.language,
      season_number: release.season_number,
      episode_number: release.episode_number,
      concurrency: opts?.concurrency,
    }

    const source = indexerMap[release.indexer_source].source

    switch (source) {
      case 'torrent': {
        return await new TorrentDownload(onProgress).add(data)
      }

      case 'ripper': {
        return await new RipperDownload(onProgress).add(data)
      }

      case 'subtitle': {
        return await new SubtitleDownload(onProgress).add(data)
      }
    }
  }

  private resolveTracksDir(mediaId: string) {
    const tracksRoot = config.root_folders?.tracks

    if (!tracksRoot) {
      throw new Error('No tracks root folder configured')
    }

    return join(tracksRoot, mediaId)
  }
}
