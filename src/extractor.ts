import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { Formatters } from '@/formatters'

const SUBTITLE_EXTENSIONS: Record<string, string> = {
  subrip: '.srt',
  ass: '.ass',
  hdmv_pgs_subtitle: '.sup',
}

interface TrackInput {
  stream_index: number
  stream_type: string
  codec_name: string
  language: string | null
  width: number | null
  height: number | null
  channel_layout: string | null
}

export class Extractor {
  async extract(mediaId: number, tracksRootFolder: string) {
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
    media: { media_type: string; title: string; year: number | null }
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

  extension(streamType: string, codecName: string) {
    if (streamType === 'video') {
      return '.mkv'
    }

    if (streamType === 'audio') {
      return '.mka'
    }

    return SUBTITLE_EXTENSIONS[codecName] ?? '.mks'
  }

  filename(track: TrackInput) {
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

  outputPath(
    tracksRootFolder: string,
    mediaType: string,
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
