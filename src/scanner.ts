import { stat } from 'fs/promises'
import { extname, join } from 'path'

import { FFmpegBuilder, type Stream } from '@lobomfz/ffmpeg'

import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { Log } from '@/log'

const VALID_EXTENSIONS = new Set(['mkv', 'mp4', 'avi', 'ts'])

const MEDIA_GLOB = new Bun.Glob(`**/*.{${[...VALID_EXTENSIONS].join(',')}}`)

export class Scanner {
  async scan(mediaId: string, opts?: { force?: boolean }) {
    const media = await DbMedia.getById(mediaId)

    if (!media) {
      throw new Error(`Media ${mediaId} not found`)
    }

    await Log.info(`scan started media_id=${mediaId}`)

    if (opts?.force) {
      const deleted = await DbMediaFiles.deleteByMediaId(mediaId)
      await Log.info(`scan force mode: deleted ${deleted} files for ${mediaId}`)
    }

    const downloads = await DbDownloads.getCompletedDownloads(mediaId)

    if (downloads.length === 0) {
      await Log.info('scan: no completed downloads with content_path')

      return await DbMediaFiles.getByMediaId(mediaId)
    }

    const { files: diskFiles, resolvedIds } =
      await this.discoverFiles(downloads)

    return await this.reconcile(mediaId, diskFiles, resolvedIds)
  }

  private async reconcile(
    mediaId: string,
    diskFiles: Map<string, number>,
    resolvedIds: Set<number>
  ) {
    const existingFiles = await DbMediaFiles.getByMediaId(mediaId)

    const existingPaths = new Set(existingFiles.map((f) => f.path))

    const staleIds = existingFiles
      .filter((f) => resolvedIds.has(f.download_id) && !diskFiles.has(f.path))
      .map((f) => f.id)

    if (staleIds.length > 0) {
      await DbMediaFiles.deleteByIds(staleIds)

      await Log.info(
        `scan stale files removed: ${staleIds.length} ids=${staleIds.join(',')}`
      )
    }

    const newFiles = [...diskFiles].filter(([p]) => !existingPaths.has(p))

    let probed = 0

    for (const [path, downloadId] of newFiles) {
      const success = await this.probeAndPersist(
        mediaId,
        downloadId,
        path
      ).catch(async (err) => {
        await Log.warn(
          `probe failed file="${path}" error="${err instanceof Error ? err.message : String(err)}"`
        )
        return false
      })

      if (success) {
        probed++
      }
    }

    const finalFiles = await DbMediaFiles.getByMediaId(mediaId)

    await Log.info(
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
        async () => {
          await Log.warn(
            `scan content_path not accessible: "${dl.content_path}"`
          )
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

    await Log.info(
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

  private async probeAndPersist(
    mediaId: string,
    downloadId: number,
    fullPath: string
  ) {
    await Log.info(`probing file="${fullPath}"`)

    const probe = await new FFmpegBuilder().input(fullPath).probe()

    const file = await DbMediaFiles.create({
      media_id: mediaId,
      download_id: downloadId,
      path: fullPath,
      size: probe.format.size,
      format_name: probe.format.format_name,
      duration: probe.format.duration,
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

    await Log.info(
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
