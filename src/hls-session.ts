import { mkdir, rm } from 'fs/promises'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { Log } from '@/log'

export class HlsSession {
  private segments: { pts: number; duration: number }[]
  private process: ReturnType<FFmpegBuilder['spawn']> | null = null
  private processExited = false
  private processStartIndex = 0
  private starting: Promise<void> | null = null

  constructor(
    private opts: {
      videoFilePath: string
      audioFilePath: string
      videoStreamIndex: number
      audioStreamIndex: number
      keyframes: number[]
      duration: number
      outDir: string
    }
  ) {
    this.segments = opts.keyframes.map((pts, i) => ({
      pts,
      duration: (opts.keyframes[i + 1] ?? opts.duration) - pts,
    }))
  }

  getPlaylist() {
    const maxDuration = Math.ceil(
      Math.max(...this.segments.map((s) => s.duration))
    )

    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${maxDuration}`,
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXT-X-MEDIA-SEQUENCE:0',
    ]

    for (let i = 0; i < this.segments.length; i++) {
      lines.push(`#EXTINF:${this.segments[i].duration.toFixed(6)},`)
      lines.push(this.segmentFilename(i))
    }

    lines.push('#EXT-X-ENDLIST')

    return lines.join('\n')
  }

  async getSegment(index: number) {
    const segPath = join(this.opts.outDir, this.segmentFilename(index))

    if (this.isSegmentSealed(index)) {
      return segPath
    }

    await this.ensureProcessFor(index)
    await this.pollForSegmentSealed(index)

    await Log.info(`segment ${index} ready size=${Bun.file(segPath).size}`)

    return segPath
  }

  async cleanup() {
    await this.killProcess()
    await rm(this.opts.outDir, { recursive: true })
  }

  private async ensureProcessFor(index: number) {
    if (this.starting) {
      await this.starting
    }

    if (!this.process) {
      await this.startProcessFrom(index)
      return
    }

    if (!this.shouldRestart(index)) {
      return
    }

    await this.killProcess()
    await this.startProcessFrom(index)
  }

  private shouldRestart(index: number) {
    if (index < this.processStartIndex) {
      return true
    }

    return index - this.findLastWrittenSegment() > 10
  }

  private findLastWrittenSegment() {
    for (let i = this.segments.length - 1; i >= this.processStartIndex; i--) {
      if (Bun.file(join(this.opts.outDir, this.segmentFilename(i))).size > 0) {
        return i
      }
    }

    return this.processStartIndex - 1
  }

  private async killProcess() {
    if (this.process) {
      this.process.kill()
      await this.process.exited
      this.process = null
    }

    this.starting = null
  }

  private async startProcessFrom(index: number) {
    this.starting = this.doStartProcess(index)
    await this.starting
    this.starting = null
  }

  private async doStartProcess(fromIndex: number) {
    await mkdir(this.opts.outDir, { recursive: true })

    this.processStartIndex = fromIndex
    this.processExited = false

    const segment = this.segments[fromIndex]
    const sameFile = this.opts.videoFilePath === this.opts.audioFilePath
    const audioInputIndex = sameFile ? 0 : 1
    const hlsTime = Math.min(...this.segments.map((s) => s.duration)) * 0.9

    let builder = new FFmpegBuilder({ overwrite: true })

    if (segment.pts > 0) {
      builder = builder.seek(segment.pts)
    }

    builder = builder.input(this.opts.videoFilePath)

    if (!sameFile) {
      if (segment.pts > 0) {
        builder = builder.seek(segment.pts)
      }

      builder = builder.input(this.opts.audioFilePath)
    }

    builder = builder
      .raw('-copyts', '-start_at_zero', '-avoid_negative_ts', 'disabled')
      .map(`0:${this.opts.videoStreamIndex}`)
      .map(`${audioInputIndex}:${this.opts.audioStreamIndex}`)
      .codec('v', 'copy')
      .codec('a', 'copy')
      .hls({
        time: hlsTime,
        listSize: 0,
        segmentFilename: join(this.opts.outDir, 'seg_%03d.ts'),
      })

    if (fromIndex > 0) {
      builder = builder.raw('-start_number', String(fromIndex))
    }

    builder = builder.output(join(this.opts.outDir, 'ffmpeg_playlist.m3u8'))

    await Log.info(
      `starting FFmpeg from segment ${fromIndex} pts=${segment.pts} args=${builder.toArgs().join(' ')}`
    )

    this.processExited = false
    this.process = builder.spawn()
    this.process.exited.then(() => {
      this.processExited = true
    })
  }

  private isSegmentSealed(index: number) {
    if (
      Bun.file(join(this.opts.outDir, this.segmentFilename(index))).size === 0
    ) {
      return false
    }

    if (
      Bun.file(join(this.opts.outDir, this.segmentFilename(index + 1))).size > 0
    ) {
      return true
    }

    return this.processExited
  }

  private async pollForSegmentSealed(index: number) {
    const maxWait = 30_000
    const interval = 50
    let waited = 0

    while (waited < maxWait) {
      if (this.isSegmentSealed(index)) {
        return
      }

      await Bun.sleep(interval)
      waited += interval
    }

    throw new Error(`Timeout waiting for segment ${index}`)
  }

  private segmentFilename(index: number) {
    return `seg_${String(index).padStart(3, '0')}.ts`
  }
}
