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

    try {
      const stream = new FFmpegBuilder({ overwrite: true })
        .input(subtitlePath)
        .map(`0:${subtitleStreamIndex}`)
        .format('srt')
        .pipe()

      const chunks: Uint8Array[] = []

      for await (const chunk of stream) {
        chunks.push(chunk)
      }

      return Buffer.concat(chunks).toString('utf-8')
    } catch (err: any) {
      Log.warn(
        `subtitle extraction failed path="${subtitlePath}" stream_index=${subtitleStreamIndex} error="${err.message}"`
      )

      return null
    }
  },
}
