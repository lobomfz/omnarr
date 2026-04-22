import { stat } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'

import { FFmpegBuilder, type Stream } from '@lobomfz/ffmpeg'
import PQueue from 'p-queue'

import { PubSub } from '@/api/pubsub'
import { VadExtractor } from '@/audio/vad-extractor'
import { ScanProgress } from '@/core/scan-progress'
import { db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbEpisodes } from '@/db/episodes'
import { DbEvents } from '@/db/events'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'
import { Scheduler } from '@/jobs/scheduler'
import { Formatters } from '@/lib/formatters'
import { Log } from '@/lib/log'
import { Parsers } from '@/lib/parsers'
import { OmnarrError } from '@/shared/errors'

const VALID_EXTENSIONS = new Set(['mkv', 'mp4', 'avi', 'ts', 'mka', 'srt'])

const SUBTITLE_EXTENSIONS = new Set(['srt'])
const SUBTITLE_CODEC: Record<string, string> = { srt: 'subrip' }

const MEDIA_GLOB = new Bun.Glob(`**/*.{${[...VALID_EXTENSIONS].join(',')}}`)

export class Scanner {
  async rescan(mediaId: string, force?: boolean) {
    const media = await DbMedia.getById(mediaId)

    if (!media) {
      throw new OmnarrError('MEDIA_NOT_FOUND')
    }

    await DbEvents.deleteScanErrors(mediaId)

    Scheduler.scan(mediaId, force)

    return { media_id: mediaId }
  }

  async scan(
    mediaId: string,
    opts?: {
      force?: boolean
      concurrency?: number
    }
  ) {
    const media = await DbMedia.getById(mediaId)

    if (!media) {
      throw new OmnarrError('MEDIA_NOT_FOUND')
    }

    Log.info(`scan started media_id=${mediaId}`)

    await DbEvents.deleteScanErrors(mediaId)

    try {
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
        resolvedIds,
        opts?.concurrency
      )
    } finally {
      await PubSub.publish('scan_completed', { media_id: mediaId })
    }
  }

  private async reconcile(
    media: { id: string; tmdb_media_id: number },
    diskFiles: Map<string, number>,
    resolvedIds: Set<number>,
    concurrency?: number
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
    const queue = new PQueue({ concurrency: concurrency ?? 1 })
    let nextIndex = 0

    for (const [path, downloadId] of newFiles) {
      const fileIndex = ++nextIndex

      void queue.add(async () => {
        await PubSub.publish('scan_progress', {
          media_id: media.id,
          current: fileIndex,
          total: newFiles.length,
          path,
        })

        const success = await this.probeAndPersist(
          media,
          downloadId,
          path
        ).catch(async (err) => {
          Log.warn(`probe failed file="${path}" error="${err.message}"`)

          await DbEvents.create({
            media_id: media.id,
            entity_type: 'scan',
            entity_id: path,
            event_type: 'file_error',
            message: err.message,
          })

          return false
        })

        if (success) {
          probed++
        }
      })
    }

    await queue.onIdle()

    const finalFiles = await DbMediaFiles.getByMediaId(media.id)

    Log.info(
      `scan complete total=${finalFiles.length} new=${probed} deleted=${staleIds.length}`
    )

    return finalFiles
  }

  private async discoverFiles(
    downloads: {
      id: number
      content_path: string
    }[]
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

  private parseExtension(path: string) {
    return extname(path).slice(1).toLowerCase()
  }

  private async resolveContentPath(contentPath: string) {
    const s = await stat(contentPath)

    if (s.isFile()) {
      if (VALID_EXTENSIONS.has(this.parseExtension(contentPath))) {
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

  private parseSeasonEpisode(fullPath: string) {
    const parsed = Parsers.seasonEpisode(basename(fullPath))

    if (parsed.season_number !== null) {
      return parsed
    }

    return Parsers.seasonEpisode(basename(dirname(fullPath)))
  }

  private async resolveEpisodeId(tmdbMediaId: number, fullPath: string) {
    const parsed = this.parseSeasonEpisode(fullPath)

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

    const ext = this.parseExtension(fullPath)

    if (SUBTITLE_EXTENSIONS.has(ext)) {
      const fileSize = (await stat(fullPath)).size
      const episodeId = await this.resolveEpisodeId(
        media.tmdb_media_id,
        fullPath
      )

      const name = basename(fullPath, extname(fullPath))
      const langMatch = /^sub_([a-z]+)/i.exec(name)
      const language = Formatters.language(langMatch?.[1])

      await db.transaction().execute(async (trx) => {
        const file = await DbMediaFiles.create(
          {
            media_id: media.id,
            download_id: downloadId,
            path: fullPath,
            size: fileSize,
            episode_id: episodeId,
          },
          trx
        )

        await DbMediaTracks.createMany(
          [
            {
              media_file_id: file.id,
              stream_index: 0,
              stream_type: 'subtitle',
              codec_name: SUBTITLE_CODEC[ext],
              language,
              is_default: false,
            },
          ],
          trx
        )
      })

      Log.info(`subtitle registered file="${fullPath}" lang=${language}`)

      return true
    }

    const probe = await new FFmpegBuilder().input(fullPath).probe()
    const episodeId = await this.resolveEpisodeId(media.tmdb_media_id, fullPath)

    const { file, tracks } = await db.transaction().execute(async (trx) => {
      const file = await DbMediaFiles.create(
        {
          media_id: media.id,
          download_id: downloadId,
          path: fullPath,
          size: probe.format.size,
          format_name: probe.format.format_name,
          start_time: probe.format.start_time,
          duration: probe.format.duration,
          episode_id: episodeId,
        },
        trx
      )

      const tracks = await DbMediaTracks.createMany(
        probe.streams.map((stream) => ({
          media_file_id: file.id,
          stream_index: stream.index,
          stream_type: stream.codec_type,
          codec_name: stream.codec_name,
          language: stream.tags?.language,
          title: stream.tags?.title,
          is_default: !!stream.disposition?.default,
          scan_ratio:
            stream.codec_type === 'video' || stream.codec_type === 'audio'
              ? 0
              : undefined,
          ...this.streamFields(stream),
        })),
        trx
      )

      return { file, tracks }
    })

    const videoTracks = tracks.filter((t) => t.stream_type === 'video')
    const audioTracks = tracks.filter((t) => t.stream_type === 'audio')

    const keyframeResults = await Promise.allSettled(
      videoTracks.map(async (track, index) => ({
        track,
        keyframes: await new FFmpegBuilder().input(fullPath).probeKeyframes({
          streamIndex: index,
          duration: probe.format.duration,
          onProgress: async (ratio) => {
            await ScanProgress.publishTrack({
              media_id: media.id,
              media_file_id: file.id,
              track_id: track.id,
              path: fullPath,
              current_step: 'keyframes',
              ratio,
            })
          },
        }),
      }))
    )

    const vadResults = await Promise.allSettled(
      audioTracks.map(async (track) => ({
        track,
        vad: await new VadExtractor(
          {
            path: fullPath,
            stream_index: track.stream_index,
          },
          {
            media_id: media.id,
            media_file_id: file.id,
            track_id: track.id,
          }
        ).extract({
          duration: probe.format.duration,
        }),
      }))
    )

    const keyframeTimesByTrack = await this.collectTrackResults(
      keyframeResults,
      videoTracks,
      { mediaId: media.id, fullPath, kind: 'keyframes' }
    )
    const vadTimestampsByTrack = await this.collectTrackResults(
      vadResults,
      audioTracks,
      { mediaId: media.id, fullPath, kind: 'vad' }
    )

    if (keyframeTimesByTrack.length > 0) {
      const totalKeyframes = keyframeTimesByTrack.reduce(
        (count, entry) => count + entry.keyframes.length,
        0
      )

      Log.info(
        `keyframe probe complete file="${fullPath}" tracks=${keyframeTimesByTrack.length} keyframes=${totalKeyframes}`
      )
    }

    if (vadTimestampsByTrack.length > 0) {
      const totalVadSegments = vadTimestampsByTrack.reduce(
        (count, entry) => count + entry.vad.length / 2,
        0
      )

      Log.info(
        `vad extracted file="${fullPath}" tracks=${vadTimestampsByTrack.length} segments=${totalVadSegments}`
      )
    }

    await db.transaction().execute(async (trx) => {
      for (const { track, keyframes } of keyframeTimesByTrack) {
        if (keyframes.length === 0) {
          continue
        }

        const trackDuration = this.computeTrackDuration(
          track,
          probe.format.duration
        )

        if (trackDuration == null) {
          Log.warn(
            `scan skip track keyframes: unknown duration file="${fullPath}" track_id=${track.id}`
          )

          continue
        }

        await DbMediaKeyframes.createBatch(
          keyframes.map((pts_time, index) => ({
            track_id: track.id,
            pts_time,
            duration: (keyframes[index + 1] ?? trackDuration) - pts_time,
          })),
          trx
        )
      }

      for (const { track, vad } of vadTimestampsByTrack) {
        await DbMediaVad.create(
          {
            track_id: track.id,
            data: new Uint8Array(vad.buffer),
          },
          trx
        )
      }
    })

    await Promise.all([
      ...keyframeTimesByTrack.map(({ track }) =>
        ScanProgress.publishTrack({
          media_id: media.id,
          media_file_id: file.id,
          track_id: track.id,
          path: fullPath,
          current_step: 'keyframes',
          ratio: 1,
        })
      ),
      ...vadTimestampsByTrack.map(({ track }) =>
        ScanProgress.publishTrack({
          media_id: media.id,
          media_file_id: file.id,
          track_id: track.id,
          path: fullPath,
          current_step: 'vad',
          ratio: 1,
        })
      ),
    ])

    Log.info(
      `probe complete file="${fullPath}" streams=${probe.streams.length} duration=${probe.format.duration} format=${probe.format.format_name}`
    )

    return true
  }

  private async collectTrackResults<R, T extends { id: number }>(
    results: PromiseSettledResult<R & { track: T }>[],
    tracks: T[],
    context: { mediaId: string; fullPath: string; kind: 'keyframes' | 'vad' }
  ) {
    const successes: (R & { track: T })[] = []

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const track = tracks[i]

      if (result.status === 'fulfilled') {
        successes.push(result.value)
        continue
      }

      Log.warn(
        `${context.kind} extraction failed file="${context.fullPath}" track_id=${track.id} error="${result.reason.message}"`
      )

      await DbMediaTracks.updateScanRatio(track.id, null)
      await DbEvents.create({
        media_id: context.mediaId,
        entity_type: 'scan',
        entity_id: context.fullPath,
        event_type: 'file_error',
        message: `${context.kind} track_id=${track.id}: ${result.reason.message}`,
      })
    }

    return successes
  }

  private computeTrackDuration(
    track: {
      duration_ts: number | null
      start_pts: number | null
      time_base: string | null
    },
    fallback: number | undefined
  ) {
    if (
      track.duration_ts == null ||
      track.start_pts == null ||
      !track.time_base
    ) {
      return fallback
    }

    const [num, den] = track.time_base.split('/')
    const numerator = Number(num)
    const denominator = Number(den)

    if (
      !Number.isFinite(numerator) ||
      !Number.isFinite(denominator) ||
      denominator === 0
    ) {
      return fallback
    }

    return ((track.start_pts + track.duration_ts) * numerator) / denominator
  }

  private streamFields(stream: Stream) {
    const base = {
      start_pts: stream.start_pts,
      start_time: stream.start_time,
      duration_ts: stream.duration_ts,
      time_base: stream.time_base,
    }

    if (stream.codec_type === 'video') {
      return {
        ...base,
        width: stream.width,
        height: stream.height,
        framerate: stream.framerate,
        bit_rate: stream.bit_rate,
      }
    }

    if (stream.codec_type === 'audio') {
      return {
        ...base,
        channels: stream.channels,
        channel_layout: stream.channel_layout,
        sample_rate: stream.sample_rate,
        bit_rate: stream.bit_rate,
      }
    }

    return base
  }
}
