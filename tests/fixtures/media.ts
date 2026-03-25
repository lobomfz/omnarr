import { copyFileSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

export const MediaFixtures = {
  async generate(outputPath: string) {
    mkdirSync(dirname(outputPath), { recursive: true })

    await new FFmpegBuilder({ overwrite: true })
      .rawInput('-f', 'lavfi')
      .input('color=c=black:s=320x240:d=0.1:r=24')
      .rawInput('-f', 'lavfi')
      .input('anullsrc=r=48000:cl=stereo')
      .duration(0.1)
      .codec('v', 'libx264')
      .preset('ultrafast')
      .codec('a', 'aac')
      .output(outputPath)
      .run()
  },

  async generateWithSubs(outputPath: string, tmpDir: string) {
    const srtPath = join(tmpDir, 'ref.srt')
    writeFileSync(srtPath, '1\n00:00:00,000 --> 00:00:00,100\nTest\n')

    mkdirSync(dirname(outputPath), { recursive: true })

    await new FFmpegBuilder({ overwrite: true })
      .rawInput('-f', 'lavfi')
      .input('color=c=black:s=320x240:d=0.1:r=24')
      .rawInput('-f', 'lavfi')
      .input('anullsrc=r=48000:cl=stereo')
      .input(srtPath)
      .duration(0.1)
      .codec('v', 'libx264')
      .preset('ultrafast')
      .codec('a', 'aac')
      .codec('s', 'subrip')
      .raw('-disposition:v:0', 'default')
      .raw('-disposition:a:0', 'default')
      .raw('-metadata:s:a:0', 'language=eng')
      .raw('-metadata:s:a:0', 'title=English Stereo')
      .raw('-metadata:s:s:0', 'language=por')
      .output(outputPath)
      .run()
  },

  copy(src: string, dest: string) {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  },

  writeDummy(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, 'dummy')
  },
}
