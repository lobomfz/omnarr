import type { Insertable } from '@lobomfz/db'

import { type DB } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/utils'

export async function seedMedia() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    year: 1999,
  })

  return await DbMedia.create({
    id: deriveId('603:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/movies',
  })
}

export async function seedDownloadWithTracks(
  mediaId: string,
  infoHash: string,
  filePath: string,
  tracks: Omit<Insertable<DB['media_tracks']>, 'media_file_id'>[],
  opts?: { duration?: number; keyframes?: number[] }
) {
  const download = await DbDownloads.create({
    media_id: mediaId,
    info_hash: infoHash,
    download_url: `magnet:${infoHash}`,
    status: 'completed',
    content_path: '/movies/The Matrix (1999)',
  })

  const file = await DbMediaFiles.create({
    media_id: mediaId,
    download_id: download.id,
    path: filePath,
    size: 8_000_000_000,
    duration: opts?.duration,
  })

  await DbMediaTracks.createMany(
    tracks.map((t) => ({ media_file_id: file.id, ...t }))
  )

  if (opts?.keyframes && opts.keyframes.length > 0) {
    await DbMediaKeyframes.createBatch(
      opts.keyframes.map((pts_time) => ({
        media_file_id: file.id,
        stream_index: 0,
        pts_time,
      }))
    )
  }

  return { download, file }
}
