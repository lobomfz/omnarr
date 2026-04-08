import { ORPCError } from '@orpc/server'

import { DownloadEvents } from '@/core/download-events'
import type { DownloadData, DownloadSource } from '@/core/types/download-source'
import { DbDownloads } from '@/db/downloads'
import { DbEpisodes } from '@/db/episodes'
import { DbEvents } from '@/db/events'
import { DbMedia } from '@/db/media'
import { Scheduler } from '@/jobs/scheduler'

export class RipperDownload implements DownloadSource {
  enqueue: DownloadSource['enqueue'] = async (data) => {
    if (data.season_number != null && data.episode_number == null) {
      return await this.enqueueSeason(data)
    }

    const download = await DbDownloads.create({
      media_id: data.media_id,
      source_id: data.source_id,
      download_url: data.download_url,
      source: 'ripper',
      status: 'pending',
      season_number: data.season_number,
      episode_number: data.episode_number,
    })

    Scheduler.ripper({
      media_id: data.media_id,
      download_id: download.id,
      source_id: data.source_id,
      imdb_id: data.imdb_id,
      title: data.title,
      tracks_dir: data.tracks_dir,
      audio_only: data.audio_only,
      season_number: data.season_number,
      episode_number: data.episode_number,
    })

    await DbEvents.create({
      media_id: data.media_id,
      entity_type: 'download',
      entity_id: data.source_id,
      event_type: 'created',
      message: `Download started: ${data.title}`,
    })

    await DownloadEvents.publish(download.id)

    return {
      media_id: data.media_id,
      download_id: download.id,
      title: data.title,
      year: data.year,
    }
  }

  private async enqueueSeason(data: DownloadData) {
    const media = await DbMedia.getById(data.media_id)

    if (!media) {
      throw new Error(`Media '${data.media_id}' not found.`)
    }

    const episodes = await DbEpisodes.listBySeason(
      media.tmdb_id,
      data.season_number!
    )

    if (episodes.length === 0) {
      throw new ORPCError('NO_EPISODES')
    }

    const downloads = await DbDownloads.createBatch(
      episodes.map((ep) => ({
        media_id: data.media_id,
        source_id: data.source_id,
        download_url: data.download_url,
        source: 'ripper' as const,
        status: 'pending' as const,
        season_number: data.season_number,
        episode_number: ep.episode_number,
      }))
    )

    for (const download of downloads) {
      Scheduler.ripper({
        media_id: data.media_id,
        download_id: download.id,
        source_id: data.source_id,
        imdb_id: data.imdb_id,
        title: data.title,
        tracks_dir: data.tracks_dir,
        audio_only: data.audio_only,
        season_number: data.season_number,
        episode_number: download.episode_number,
      })
    }

    await DbEvents.create({
      media_id: data.media_id,
      entity_type: 'download',
      entity_id: data.source_id,
      event_type: 'created',
      message: `Download started: ${data.title} S${String(data.season_number).padStart(2, '0')} (${episodes.length} episodes)`,
    })

    await DownloadEvents.publishMany(downloads.map((d) => d.id))

    return {
      media_id: data.media_id,
      download_id: downloads[0].id,
      title: data.title,
      year: data.year,
    }
  }
}
