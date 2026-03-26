import { watch as fsWatch, type FSWatcher } from 'fs'
import { mkdir, rm, readdir, unlink } from 'fs/promises'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { Log } from '@/log'

export class HlsSession {
  private segments: { pts: number; duration: number }[]
  private process: ReturnType<FFmpegBuilder['spawn']> | null = null
  private processStartIndex = 0
  private starting: Promise<void> | null = null
  private sealedSegments = new Set<number>()
  private segmentWaiters = new Map<
    number,
    { resolve: () => void; reject: (err: Error) => void }
  >()
  private watcher: FSWatcher | null = null

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
    if (index < 0 || index >= this.segments.length) {
      throw new Error(
        `segment ${index} out of range [0, ${this.segments.length})`
      )
    }

    const segPath = join(this.opts.outDir, this.segmentFilename(index))

    if (this.sealedSegments.has(index)) {
      return segPath
    }

    await this.ensureProcessFor(index)
    await this.waitForSegment(index)

    await Log.info(`segment ${index} ready size=${Bun.file(segPath).size}`)

    return segPath
  }

  async cleanup() {
    await this.killProcess()
    await rm(this.opts.outDir, { recursive: true, force: true })
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

    return index - this.lastSealedSegment() > 10
  }

  private lastSealedSegment() {
    let max = this.processStartIndex - 1

    for (const index of this.sealedSegments) {
      if (index > max) {
        max = index
      }
    }

    return max
  }

  private async killProcess() {
    this.stopWatcher()

    for (const [, waiter] of this.segmentWaiters) {
      waiter.reject(new Error('Process killed'))
    }

    this.segmentWaiters.clear()

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
    await this.clearSegments()
    await mkdir(this.opts.outDir, { recursive: true })

    this.processStartIndex = fromIndex
    this.sealedSegments.clear()

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

    this.startWatcher(fromIndex)
    this.process = builder.spawn()

    this.process.exited.then(() => {
      this.sealAllWrittenSegments()

      for (const [, waiter] of this.segmentWaiters) {
        waiter.reject(new Error('Process exited without producing segment'))
      }

      this.segmentWaiters.clear()
    })
  }

  private startWatcher(fromIndex: number) {
    this.stopWatcher()

    this.watcher = fsWatch(this.opts.outDir, (_eventType, filename) => {
      if (!filename?.endsWith('.ts')) {
        return
      }

      const index = this.parseSegmentIndex(filename)

      if (index === null || index <= fromIndex) {
        return
      }

      for (let i = fromIndex; i < index; i++) {
        this.sealSegment(i)
      }
    })
  }

  private stopWatcher() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  private sealSegment(index: number) {
    this.sealedSegments.add(index)

    const waiter = this.segmentWaiters.get(index)

    if (waiter) {
      waiter.resolve()
      this.segmentWaiters.delete(index)
    }
  }

  private sealAllWrittenSegments() {
    for (let i = this.processStartIndex; i < this.segments.length; i++) {
      if (Bun.file(join(this.opts.outDir, this.segmentFilename(i))).size > 0) {
        this.sealSegment(i)
      }
    }
  }

  private waitForSegment(index: number) {
    if (this.sealedSegments.has(index)) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      this.segmentWaiters.set(index, { resolve, reject })
    })
  }

  private parseSegmentIndex(filename: string) {
    const match = filename.match(/^seg_(\d+)\.ts$/)

    if (!match) {
      return null
    }

    return parseInt(match[1], 10)
  }

  private async clearSegments() {
    const entries = await readdir(this.opts.outDir).catch(() => [])

    await Promise.all(
      entries
        .filter((f) => f.endsWith('.ts'))
        .map((f) => unlink(join(this.opts.outDir, f)))
    )
  }

  private segmentFilename(index: number) {
    return `seg_${String(index).padStart(3, '0')}.ts`
  }
}
