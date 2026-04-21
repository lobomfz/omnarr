import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { SubtitleExtractor } from '@/audio/subtitle-extractor'
import type { TracksWithFile } from '@/db/media-tracks'
import { Log } from '@/lib/log'
import { HlsSession, type Segment } from '@/player/hls-session'
import { segmentFilename } from '@/player/segment-watcher'
import {
  type SubtitleCue,
  SubtitleSegmenter,
  type SubtitleWindow,
} from '@/player/subtitle-segmenter'
import type { TranscodeFn } from '@/player/transcoder'

const HLS_CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.vtt': 'text/vtt',
}

type ResolvedTrack = Pick<
  TracksWithFile[number],
  'file_path' | 'stream_index' | 'codec_name' | 'language' | 'title'
>

type HlsServerOpts = {
  resolved: {
    video: ResolvedTrack
    audio: ResolvedTrack
    subtitle: ResolvedTrack | null
  }
  segments: Segment[]
  transcode: TranscodeFn
  audioOffset: number
  audioSpeed: number
  subtitleOffset: number
  subtitleSpeed: number
  mediaId: string
}

export class HlsServer extends HlsSession {
  private serverOpts: HlsServerOpts
  private subtitleCues: SubtitleCue[] = []
  private subtitleWindows: SubtitleWindow[] = []
  private pesStartTimeCache = new Map<number, number>()
  private prefix: string

  constructor(opts: HlsServerOpts) {
    super({
      videoFilePath: opts.resolved.video.file_path,
      audioFilePath: opts.resolved.audio.file_path,
      videoStreamIndex: opts.resolved.video.stream_index,
      audioStreamIndex: opts.resolved.audio.stream_index,
      segments: opts.segments,
      audioOffset: opts.audioOffset,
      audioSpeed: opts.audioSpeed,
      outDir: mkdtempSync(join(tmpdir(), 'omnarr-play-')),
      transcode: opts.transcode,
    })
    this.serverOpts = opts
    this.prefix = `/hls/${opts.mediaId}`
  }

  get hlsPath() {
    return `${this.prefix}/master.m3u8`
  }

  async start() {
    await Bun.write(join(this.opts.outDir, 'video.m3u8'), this.buildPlaylist())

    if (this.serverOpts.resolved.subtitle) {
      await this.prepareSubtitles(
        this.serverOpts.resolved.subtitle,
        this.serverOpts.subtitleOffset,
        this.serverOpts.subtitleSpeed
      )
    }

    await Bun.write(
      join(this.opts.outDir, 'master.m3u8'),
      this.buildMasterPlaylist()
    )
  }

  async stop() {
    await this.cleanup()
  }

  async handle(req: Request) {
    const url = new URL(req.url)
    const raw = url.pathname

    if (!raw.startsWith(this.prefix)) {
      return new Response('Not Found', { status: 404 })
    }

    let pathname = raw.slice(this.prefix.length) || '/'

    if (pathname === '/') {
      pathname = '/master.m3u8'
    }

    const filePath = resolve(this.opts.outDir, pathname.slice(1))

    if (!filePath.startsWith(this.opts.outDir + '/')) {
      return new Response('Forbidden', { status: 403 })
    }

    const ext = pathname.slice(pathname.lastIndexOf('.'))

    if (ext === '.ts') {
      return await this.serveSegment(pathname)
    }

    if (ext === '.vtt') {
      return await this.serveVtt(pathname)
    }

    const file = Bun.file(filePath)

    if (!(await file.exists())) {
      return new Response('Not Found', { status: 404 })
    }

    return new Response(file, {
      headers: {
        'Content-Type': HLS_CONTENT_TYPES[ext] ?? 'application/octet-stream',
      },
    })
  }

  private buildPlaylist() {
    const maxDuration = Math.ceil(
      Math.max(...this.opts.segments.map((s) => s.duration))
    )

    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${maxDuration}`,
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXT-X-MEDIA-SEQUENCE:0',
    ]

    for (let i = 0; i < this.opts.segments.length; i++) {
      lines.push(`#EXTINF:${this.opts.segments[i].duration.toFixed(6)},`)
      lines.push(segmentFilename(i))
    }

    lines.push('#EXT-X-ENDLIST')

    return lines.join('\n')
  }

  private buildMasterPlaylist() {
    const lines = ['#EXTM3U']

    if (this.serverOpts.resolved.subtitle) {
      const lang = this.serverOpts.resolved.subtitle.language ?? 'und'
      const name = this.serverOpts.resolved.subtitle.title ?? 'Subtitle'

      lines.push(
        `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="${lang}",NAME="${name}",DEFAULT=YES,AUTOSELECT=YES,URI="subs.m3u8"`
      )
      lines.push('#EXT-X-STREAM-INF:BANDWIDTH=0,SUBTITLES="subs"')
    } else {
      lines.push('#EXT-X-STREAM-INF:BANDWIDTH=0')
    }

    lines.push('video.m3u8')

    return lines.join('\n')
  }

  private async prepareSubtitles(
    subtitle: ResolvedTrack,
    subtitleOffset: number,
    subtitleSpeed: number
  ) {
    if (subtitle.codec_name !== 'subrip') {
      throw new Error(
        `Incompatible subtitle codec '${subtitle.codec_name}'. Only subrip is supported.`
      )
    }

    const srt = await SubtitleExtractor.readContent(
      subtitle.file_path,
      subtitle.stream_index
    )

    if (srt === null) {
      throw new Error(`Failed to read subtitle from ${subtitle.file_path}`)
    }

    this.subtitleCues = SubtitleSegmenter.prepareCues(
      srt,
      subtitleOffset,
      subtitleSpeed
    )
    this.subtitleWindows = SubtitleSegmenter.computeWindows(this.opts.segments)

    await Bun.write(
      join(this.opts.outDir, 'subs.m3u8'),
      SubtitleSegmenter.buildSubtitlePlaylist(this.subtitleWindows)
    )
  }

  private async probeSegmentPesStartTime(videoSegmentIndex: number) {
    const cached = this.pesStartTimeCache.get(videoSegmentIndex)

    if (cached !== undefined) {
      return cached
    }

    const segPath = await this.getSegment(videoSegmentIndex)

    const probe = await new FFmpegBuilder()
      .input(segPath)
      .probe()
      .catch((err) => {
        Log.warn(
          `failed to probe PES start time seg=${videoSegmentIndex} error=${err}`
        )

        return null
      })

    const startTime =
      probe?.format.start_time ?? this.opts.segments[videoSegmentIndex].pts_time

    this.pesStartTimeCache.set(videoSegmentIndex, startTime)

    return startTime
  }

  private async serveSubtitle(index: number) {
    if (index < 0 || index >= this.subtitleWindows.length) {
      return new Response('Not Found', { status: 404 })
    }

    const filename = `subs_${String(index).padStart(3, '0')}.vtt`
    const filePath = join(this.opts.outDir, filename)

    const cached = Bun.file(filePath)

    if (await cached.exists()) {
      return new Response(cached, {
        headers: { 'Content-Type': 'text/vtt' },
      })
    }

    const window = this.subtitleWindows[index]
    const pesStartTime = await this.probeSegmentPesStartTime(
      window.firstVideoSegment
    )
    const mpegtsOffset = Math.round(pesStartTime * 90000)

    const vtt = SubtitleSegmenter.generateVtt({
      cues: this.subtitleCues,
      windowStart: window.start,
      windowEnd: window.end,
      mpegtsOffset,
    })

    await Bun.write(filePath, vtt)

    return new Response(Bun.file(filePath), {
      headers: { 'Content-Type': 'text/vtt' },
    })
  }

  private async serveVtt(pathname: string) {
    const match = pathname.match(/subs_(\d+)\.vtt$/)

    if (!match) {
      return new Response('Not Found', { status: 404 })
    }

    const index = parseInt(match[1], 10)

    return await this.serveSubtitle(index)
  }

  private async serveSegment(pathname: string) {
    const match = pathname.match(/seg_(\d+)\.ts$/)

    if (!match) {
      return new Response('Not Found', { status: 404 })
    }

    const index = parseInt(match[1], 10)

    try {
      const start = performance.now()
      const segPath = await this.getSegment(index)
      const elapsed = (performance.now() - start).toFixed(0)
      const size = Bun.file(segPath).size

      Log.info(
        `serve segment=${index} status=200 size=${size} elapsed=${elapsed}ms`
      )

      return new Response(Bun.file(segPath), {
        headers: { 'Content-Type': 'video/mp2t' },
      })
    } catch (err: any) {
      Log.error(`serve segment=${index} status=404 error=${err.message}`)

      return new Response('Not Found', { status: 404 })
    }
  }
}
