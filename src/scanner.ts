import { join } from 'path'

import { FFmpegBuilder, type Stream } from '@lobomfz/ffmpeg'

import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { Formatters } from '@/formatters'

const VALID_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.ts'])

export class Scanner {
  async scan(mediaId: string, opts?: { force?: boolean }) {
    const media = await DbMedia.getById(mediaId)

    if (!media) {
      throw new Error(`Media ${mediaId} not found`)
    }

    if (opts?.force) {
      await DbMediaFiles.deleteByMediaId(mediaId)
    }

    const mediaDir = join(
      media.root_folder,
      Formatters.mediaTitle({ title: media.title, year: media.year })
    )

    const glob = new Bun.Glob(
      `**/*.{${[...VALID_EXTENSIONS].map((e) => e.slice(1)).join(',')}}`
    )

    const diskPaths = new Set<string>()

    for await (const relativePath of glob.scan({ cwd: mediaDir })) {
      diskPaths.add(join(mediaDir, relativePath))
    }

    const existingFiles = await DbMediaFiles.getByMediaId(mediaId)

    const existingPaths = new Set(existingFiles.map((f) => f.path))

    const toDelete = existingFiles
      .filter((f) => !diskPaths.has(f.path))
      .map((f) => f.id)

    await DbMediaFiles.deleteByIds(toDelete)

    for (const fullPath of diskPaths) {
      if (!existingPaths.has(fullPath)) {
        await this.probeAndPersist(mediaId, fullPath)
      }
    }

    return await DbMediaFiles.getByMediaId(mediaId)
  }

  private async probeAndPersist(mediaId: string, fullPath: string) {
    const probe = await new FFmpegBuilder().input(fullPath).probe()

    const file = await DbMediaFiles.create({
      media_id: mediaId,
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
