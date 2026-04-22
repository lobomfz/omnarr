import type { DownloadSchemas, SubtitlesSchemas } from '@/api/schemas'
import { RipperDownload } from '@/core/ripper-download'
import { SubtitleDownload } from '@/core/subtitle-download'
import { TorrentDownload } from '@/core/torrent-download'
import type { DownloadSource } from '@/core/types/download-source'
import type { download_source } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import type { Release } from '@/db/releases'
import { DbReleases } from '@/db/releases'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { indexerMap } from '@/integrations/indexers/registry'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Scheduler } from '@/jobs/scheduler'
import { config, resolveTracksDir } from '@/lib/config'
import { Log } from '@/lib/log'
import { deriveId } from '@/lib/utils'
import { OmnarrError } from '@/shared/errors'

const sourceMap: Record<download_source, new () => DownloadSource> = {
  torrent: TorrentDownload,
  ripper: RipperDownload,
  subtitle: SubtitleDownload,
}

export class Downloads {
  async enqueue(input: typeof DownloadSchemas.add.infer) {
    const release = await DbReleases.getById(input.release_id)

    if (!release) {
      throw new OmnarrError('RELEASE_NOT_FOUND')
    }

    const rootFolder = config.root_folders?.[release.media_type]

    if (!rootFolder) {
      throw new OmnarrError('NO_ROOT_FOLDER')
    }

    const existing = await DbDownloads.getBySourceId(release.source_id)

    if (existing) {
      throw new OmnarrError('DUPLICATE_DOWNLOAD')
    }

    const source = indexerMap[release.indexer_source].source

    const resolved = await this.resolveMedia(
      release,
      rootFolder,
      input.media_id
    )

    Log.info(
      `download enqueue release_id=${release.id} source_id=${release.source_id} source=${source}`
    )

    return await new sourceMap[source]().enqueue({
      source_id: release.source_id,
      download_url: release.download_url,
      title: resolved.title,
      year: resolved.year,
      imdb_id: resolved.imdb_id,
      media_id: resolved.mediaId,
      tracks_dir: resolveTracksDir(resolved.mediaId),
      audio_only: input.audio_only,
      language: release.language,
      season_number: release.season_number,
      episode_number: release.episode_number,
    })
  }

  async autoMatchSubtitles(input: typeof SubtitlesSchemas.autoMatch.infer) {
    const media = await DbMedia.getById(input.media_id)

    if (!media) {
      throw new OmnarrError('MEDIA_NOT_FOUND')
    }

    const episodeId = await this.resolveEpisodeId(
      media,
      input.season,
      input.episode
    )

    Scheduler.subtitleMatch({
      media_id: input.media_id,
      episode_id: episodeId,
      lang: input.lang,
      season: input.season,
      episode: input.episode,
    })

    return { media_id: input.media_id }
  }

  private async resolveMedia(
    release: Release,
    rootFolder: string,
    mediaId?: string
  ) {
    if (mediaId) {
      const existing = await DbMedia.getById(mediaId)

      if (!existing) {
        throw new OmnarrError('MEDIA_NOT_FOUND')
      }

      return {
        mediaId,
        title: existing.title,
        year: existing.year,
        imdb_id: existing.imdb_id,
      }
    }

    const details = await new TmdbClient().getDetails(
      release.tmdb_id,
      release.media_type
    )

    const tmdbMedia = await DbTmdbMedia.upsert({
      tmdb_id: details.tmdb_id,
      media_type: details.media_type,
      title: details.title,
      year: details.year,
      imdb_id: details.imdb_id,
    })

    const media = await DbMedia.create({
      id: deriveId(`${details.tmdb_id}:${details.media_type}`),
      tmdb_media_id: tmdbMedia.id,
      media_type: details.media_type,
      root_folder: rootFolder,
    })

    return {
      mediaId: media.id,
      title: details.title,
      year: details.year,
      imdb_id: details.imdb_id,
    }
  }

  private async resolveEpisodeId(
    media: { media_type: string; tmdb_media_id: number },
    season?: number,
    episode?: number
  ) {
    if (media.media_type !== 'tv') {
      return
    }

    if (season === undefined || episode === undefined) {
      throw new OmnarrError('TV_REQUIRES_SEASON_EPISODE')
    }

    const ep = await DbEpisodes.getBySeasonEpisode(
      media.tmdb_media_id,
      season,
      episode
    )

    if (!ep) {
      throw new OmnarrError('EPISODE_NOT_FOUND')
    }

    return ep.id
  }
}
