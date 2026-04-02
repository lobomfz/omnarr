import { mkdir, rm } from 'fs/promises'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { Log } from '@/lib/log'
import { SegmentWatcher, segmentFilename } from '@/player/segment-watcher'
import type { TranscodeFn } from '@/player/transcoder'

export type Segment = { pts_time: number; duration: number }

type HlsSessionOpts = {
  videoFilePath: string
  audioFilePath: string
  videoStreamIndex: number
  audioStreamIndex: number
  audioOffset: number
  segments: Segment[]
  outDir: string
  transcode: TranscodeFn
}

export class HlsSession {
  private process: ReturnType<FFmpegBuilder['spawn']> | null = null
  private processStartIndex = 0
  private starting: Promise<void> | null = null
  protected watcher: SegmentWatcher

  constructor(protected opts: HlsSessionOpts) {
    this.watcher = new SegmentWatcher(opts.outDir, opts.segments.length)
  }

  async getSegment(index: number) {
    if (index < 0 || index >= this.opts.segments.length) {
      throw new Error(
        `segment ${index} out of range [0, ${this.opts.segments.length})`
      )
    }

    const segPath = join(this.opts.outDir, segmentFilename(index))

    if (this.watcher.isSealed(index)) {
      return segPath
    }

    await this.ensureProcessFor(index)
    await this.watcher.wait(index)

    Log.info(`segment ${index} ready size=${Bun.file(segPath).size}`)

    return segPath
  }

  async cleanup() {
    await this.killProcess()
    await rm(this.opts.outDir, { recursive: true, force: true })
  }

  protected buildCommand(fromIndex: number) {
    const segment = this.opts.segments[fromIndex]
    const sameFile = this.opts.videoFilePath === this.opts.audioFilePath
    const audioInputIndex = sameFile ? 0 : 1
    const hlsTime = Math.min(...this.opts.segments.map((s) => s.duration)) * 0.9

    let builder = new FFmpegBuilder({ overwrite: true })

    if (segment.pts_time > 0) {
      builder = builder.seek(segment.pts_time)
    }

    builder = builder.input(this.opts.videoFilePath)

    if (!sameFile) {
      if (this.opts.audioOffset !== 0) {
        builder = builder.rawInput('-itsoffset', String(this.opts.audioOffset))
      }

      if (segment.pts_time > 0) {
        builder = builder.seek(segment.pts_time)
      }

      builder = builder.input(this.opts.audioFilePath)
    }

    builder = builder
      .raw('-copyts', '-start_at_zero', '-avoid_negative_ts', 'disabled')
      .map(`0:${this.opts.videoStreamIndex}`)
      .map(`${audioInputIndex}:${this.opts.audioStreamIndex}`)

    builder = this.opts.transcode(builder)

    builder = builder.hls({
      time: hlsTime,
      listSize: 0,
      segmentFilename: join(this.opts.outDir, 'seg_%03d.ts'),
    })

    if (fromIndex > 0) {
      builder = builder.raw('-start_number', String(fromIndex))
    }

    return builder.output(join(this.opts.outDir, 'ffmpeg_playlist.m3u8'))
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

    return index - this.watcher.lastSealed(this.processStartIndex) > 10
  }

  private async killProcess() {
    this.watcher.reset()

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

    const builder = this.buildCommand(fromIndex)

    Log.info(
      `starting FFmpeg from segment ${fromIndex} pts=${this.opts.segments[fromIndex].pts_time} args=${builder.toArgs().join(' ')}`
    )

    this.watcher.start(fromIndex)
    this.process = builder.spawn()

    this.process.exited
      .then(() => {
        this.watcher.sealWritten(this.processStartIndex)
        this.watcher.rejectAll(
          new Error('Process exited without producing segment')
        )
      })
      .catch((err) => {
        Log.error(
          `process exit handler error=${err instanceof Error ? err.message : String(err)}`
        )
      })
  }
}
