import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'

import type { Selectable } from '@lobomfz/db'
import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { config } from '@/config'
import type { DB, stream_type } from '@/db/connection'
import { DbMedia, type FullMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { Formatters } from '@/formatters'
import { Log } from '@/log'

type Track = Selectable<DB['media_tracks']>

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
  async extract(mediaId: string) {
    if (!config.root_folders?.tracks) {
      throw new Error(
        'root_folders.tracks not configured. Run "omnarr init" first.'
      )
    }

    const media = await DbMedia.getById(mediaId)

    if (!media) {
      throw new Error(`Media ${mediaId} not found`)
    }

    const tracks = await DbMediaTracks.getUnextracted(mediaId)
    const failed: { id: number; error: string }[] = []

    await Log.info(
      `extraction started media_id=${mediaId} tracks=${tracks.length}`
    )

    if (tracks.length === 0) {
      return { failed }
    }

    const files = await DbMediaFiles.getByMediaId(mediaId)
    const fileMap = new Map(
      files.map((f) => [f.id, { path: f.path, download_id: f.download_id }])
    )

    for (const track of tracks) {
      await this.extractSingle(
        track,
        fileMap,
        config.root_folders.tracks,
        media
      ).catch((err) => {
        failed.push({ id: track.id, error: err.message })
        Log.warn(
          `track extraction failed stream_index=${track.stream_index} codec=${track.codec_name} error="${err.message}"`
        )
      })
    }

    await Log.info(
      `extraction complete success=${tracks.length - failed.length} failed=${failed.length}`
    )

    return { failed }
  }

  private async extractSingle(
    track: Track,
    fileMap: Map<number, { path: string; download_id: number }>,
    tracksRootFolder: string,
    media: FullMedia
  ) {
    const file = fileMap.get(track.media_file_id)!

    const outPath = this.outputPath(
      tracksRootFolder,
      media,
      track,
      file.download_id
    )

    await Log.info(
      `extracting track stream_index=${track.stream_index} codec=${track.codec_name} source="${file.path}" output="${outPath}"`
    )

    await mkdir(dirname(outPath), { recursive: true })

    await new FFmpegBuilder({ overwrite: true })
      .input(file.path)
      .raw('-map', `0:${track.stream_index}`)
      .raw('-c', 'copy')
      .output(outPath)
      .run()

    const size = Bun.file(outPath).size

    await DbMediaTracks.update(track.id, { path: outPath, size })

    await Log.info(`track extracted path="${outPath}" size=${size}`)
  }

  private extension(streamType: stream_type, codecName: string) {
    return (
      STREAM_EXTENSIONS[streamType] ??
      SUBTITLE_CODEC_EXTENSIONS[codecName] ??
      '.mks'
    )
  }

  private filename(track: Track, downloadId: number) {
    const parts = [
      downloadId.toString(),
      track.stream_index.toString(),
      track.codec_name,
    ]

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
    media: FullMedia,
    track: Track,
    downloadId: number
  ) {
    return join(
      tracksRootFolder,
      media.media_type,
      Formatters.mediaTitle({ title: media.title, year: media.year }),
      track.stream_type,
      this.filename(track, downloadId)
    )
  }
}
