import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'

import type { Selectable } from '@lobomfz/db'
import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import type { DB, media_type, stream_type } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { Formatters } from '@/formatters'

type TrackInput = Pick<
  Selectable<DB['media_tracks']>,
  | 'stream_index'
  | 'stream_type'
  | 'codec_name'
  | 'language'
  | 'width'
  | 'height'
  | 'channel_layout'
>

const STREAM_EXTENSIONS: Partial<Record<stream_type, string>> = {
  video: '.mkv',
  audio: '.mka',
}

const SUBTITLE_CODEC_EXTENSIONS: Record<string, string> = {
  subrip: '.srt',
  ass: '.ass',
  hdmv_pgs_subtitle: '.sup',
}

export class Extractor {
  async extract(mediaId: string, tracksRootFolder: string) {
    const media = await DbMedia.getById(mediaId)

    if (!media) {
      throw new Error(`Media ${mediaId} not found`)
    }

    const tracks = await DbMediaTracks.getUnextracted(mediaId)
    const failed: { id: number; error: string }[] = []

    if (tracks.length === 0) {
      return { failed }
    }

    const files = await DbMediaFiles.getByMediaId(mediaId)
    const filePathMap = new Map(files.map((f) => [f.id, f.path]))

    for (const track of tracks) {
      await this.extractSingle(
        track,
        filePathMap,
        tracksRootFolder,
        media
      ).catch((err) => {
        failed.push({ id: track.id, error: err.message })
      })
    }

    return { failed }
  }

  private async extractSingle(
    track: { id: number; media_file_id: number } & TrackInput,
    filePathMap: Map<number, string>,
    tracksRootFolder: string,
    media: { media_type: media_type; title: string; year: number | null }
  ) {
    const sourcePath = filePathMap.get(track.media_file_id)!
    const outPath = this.outputPath(
      tracksRootFolder,
      media.media_type,
      media.title,
      media.year,
      track
    )

    await mkdir(dirname(outPath), { recursive: true })

    await new FFmpegBuilder({ overwrite: true })
      .input(sourcePath)
      .raw('-map', `0:${track.stream_index}`)
      .raw('-c', 'copy')
      .output(outPath)
      .run()

    const size = Bun.file(outPath).size

    await DbMediaTracks.update(track.id, { path: outPath, size })
  }

  private extension(streamType: stream_type, codecName: string) {
    return (
      STREAM_EXTENSIONS[streamType] ??
      SUBTITLE_CODEC_EXTENSIONS[codecName] ??
      '.mks'
    )
  }

  private filename(track: TrackInput) {
    const parts = [track.stream_index.toString(), track.codec_name]

    if (track.language) {
      parts.push(track.language)
    }

    if (track.stream_type === 'video' && track.width && track.height) {
      parts.push(`${track.width}x${track.height}`)
    }

    if (track.stream_type === 'audio' && track.channel_layout) {
      parts.push(track.channel_layout)
    }

    return `${parts.join('-')}${this.extension(track.stream_type, track.codec_name)}`
  }

  private outputPath(
    tracksRootFolder: string,
    mediaType: media_type,
    title: string,
    year: number | null,
    track: TrackInput
  ) {
    return join(
      tracksRootFolder,
      mediaType,
      Formatters.mediaTitle({ title, year }),
      track.stream_type,
      this.filename(track)
    )
  }
}
