import { stat } from 'fs/promises'
import { basename, extname, join } from 'path'

import { FFmpegBuilder, type Stream } from '@lobomfz/ffmpeg'

import { DbDownloads } from '@/db/downloads'
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbMediaTracks } from '@/db/media-tracks'
import { Log } from '@/log'
import { Parsers } from '@/parsers'

const VALID_EXTENSIONS = new Set(['mkv', 'mp4', 'avi', 'ts'])

const MEDIA_GLOB = new Bun.Glob(`**/*.{${[...VALID_EXTENSIONS].join(',')}}`)

export class Scanner {
  async scan(mediaId: string, opts?: { force?: boolean }) {
    const media = await DbMedia.getById(mediaId)

    if (!media) {
      throw new Error(`Media ${mediaId} not found`)
    }

    Log.info(`scan started media_id=${mediaId}`)

    if (opts?.force) {
      const deleted = await DbMediaFiles.deleteByMediaId(mediaId)
      Log.info(`scan force mode: deleted ${deleted} files for ${mediaId}`)
    }

    const downloads = await DbDownloads.getCompletedDownloads(mediaId)

    if (downloads.length === 0) {
      Log.info('scan: no completed downloads with content_path')

      return await DbMediaFiles.getByMediaId(mediaId)
    }

    const { files: diskFiles, resolvedIds } =
      await this.discoverFiles(downloads)

    return await this.reconcile(
      { id: mediaId, tmdb_media_id: media.tmdb_media_id },
      diskFiles,
      resolvedIds
    )
  }

  private async reconcile(
    media: { id: string; tmdb_media_id: number },
    diskFiles: Map<string, number>,
    resolvedIds: Set<number>
  ) {
    const existingFiles = await DbMediaFiles.getByMediaId(media.id)

    const existingPaths = new Set(existingFiles.map((f) => f.path))

    const staleIds = existingFiles
      .filter((f) => resolvedIds.has(f.download_id) && !diskFiles.has(f.path))
      .map((f) => f.id)

    if (staleIds.length > 0) {
      await DbMediaFiles.deleteByIds(staleIds)

      Log.info(
        `scan stale files removed: ${staleIds.length} ids=${staleIds.join(',')}`
      )
    }

    const newFiles = [...diskFiles].filter(([p]) => !existingPaths.has(p))

    let probed = 0

    for (const [path, downloadId] of newFiles) {
      const success = await this.probeAndPersist(media, downloadId, path).catch(
        (err) => {
          Log.warn(
            `probe failed file="${path}" error="${err instanceof Error ? err.message : String(err)}"`
          )
          return false
        }
      )

      if (success) {
        probed++
      }
    }

    const finalFiles = await DbMediaFiles.getByMediaId(media.id)

    Log.info(
      `scan complete total=${finalFiles.length} new=${probed} deleted=${staleIds.length}`
    )

    return finalFiles
  }

  private async discoverFiles(
    downloads: { id: number; content_path: string }[]
  ) {
    const files = new Map<string, number>()
    const resolvedIds = new Set<number>()

    for (const dl of downloads) {
      const resolved = await this.resolveContentPath(dl.content_path).catch(
        () => {
          Log.warn(`scan content_path not accessible: "${dl.content_path}"`)
          return null
        }
      )

      if (!resolved) {
        continue
      }

      resolvedIds.add(dl.id)

      for (const path of resolved) {
        files.set(path, dl.id)
      }
    }

    Log.info(
      `scan discovered ${files.size} files from ${downloads.length} content_paths`
    )

    return { files, resolvedIds }
  }

  private async resolveContentPath(contentPath: string) {
    const s = await stat(contentPath)

    if (s.isFile()) {
      if (VALID_EXTENSIONS.has(extname(contentPath).slice(1).toLowerCase())) {
        return [contentPath]
      }

      return []
    }

    const paths: string[] = []

    for await (const relative of MEDIA_GLOB.scan({ cwd: contentPath })) {
      paths.push(join(contentPath, relative))
    }

    return paths
  }

  private async resolveEpisodeId(tmdbMediaId: number, fullPath: string) {
    const filename = basename(fullPath)
    const parsed = Parsers.seasonEpisode(filename)

    if (parsed.season_number === null || parsed.episode_number === null) {
      return
    }

    const episode = await DbEpisodes.getBySeasonEpisode(
      tmdbMediaId,
      parsed.season_number,
      parsed.episode_number
    )

    return episode?.id
  }

  private async probeAndPersist(
    media: { id: string; tmdb_media_id: number },
    downloadId: number,
    fullPath: string
  ) {
    Log.info(`probing file="${fullPath}"`)

    const probe = await new FFmpegBuilder().input(fullPath).probe()

    const episodeId = await this.resolveEpisodeId(media.tmdb_media_id, fullPath)

    const file = await DbMediaFiles.create({
      media_id: media.id,
      download_id: downloadId,
      path: fullPath,
      size: probe.format.size,
      format_name: probe.format.format_name,
      duration: probe.format.duration,
      episode_id: episodeId,
    })

    await DbMediaTracks.createMany(
      probe.streams.map((stream) => ({
        media_file_id: file.id,
        stream_index: stream.index,
        stream_type: stream.codec_type,
        codec_name: stream.codec_name,
        language: stream.tags?.language,
        title: stream.tags?.title,
        is_default: !!stream.disposition?.default,
        ...this.streamFields(stream),
      }))
    )

    const videoStream = probe.streams.find((s) => s.codec_type === 'video')

    if (videoStream) {
      const keyframeTimes = await new FFmpegBuilder()
        .input(fullPath)
        .probeKeyframes()

      await DbMediaKeyframes.createBatch(
        keyframeTimes.map((pts_time) => ({
          media_file_id: file.id,
          stream_index: videoStream.index,
          pts_time,
        }))
      )

      Log.info(
        `keyframe probe complete file="${fullPath}" keyframes=${keyframeTimes.length}`
      )
    }

    Log.info(
      `probe complete file="${fullPath}" streams=${probe.streams.length} duration=${probe.format.duration} format=${probe.format.format_name}`
    )

    return true
  }

  private streamFields(stream: Stream) {
    if (stream.codec_type === 'video') {
      return {
        width: stream.width,
        height: stream.height,
        framerate: stream.framerate,
        bit_rate: stream.bit_rate,
      }
    }

    if (stream.codec_type === 'audio') {
      return {
        channels: stream.channels,
        channel_layout: stream.channel_layout,
        sample_rate: stream.sample_rate,
        bit_rate: stream.bit_rate,
      }
    }

    return {}
  }
}
