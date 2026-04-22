import { extname } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { Log } from '@/lib/log'

export const SubtitleExtractor = {
  async readContent(subtitlePath: string, subtitleStreamIndex?: number) {
    if (extname(subtitlePath).toLowerCase() === '.srt') {
      return await Bun.file(subtitlePath).text()
    }

    if (subtitleStreamIndex === undefined) {
      return null
    }

    const bytes = await new FFmpegBuilder({ overwrite: true })
      .input(subtitlePath)
      .map(`0:${subtitleStreamIndex}`)
      .format('srt')
      .capture()
      .catch((err: any) => {
        Log.warn(
          `subtitle extraction failed path="${subtitlePath}" stream_index=${subtitleStreamIndex} error="${err.message}"`
        )

        return null
      })

    if (bytes === null) {
      return null
    }

    return Buffer.from(bytes).toString('utf-8')
  },
}
