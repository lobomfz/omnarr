import { mkdtempSync } from 'fs'
import { mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import type { TracksWithFile } from '@/db/media-tracks'
import { Log } from '@/log'
import { HlsSession, type Segment } from '@/player/hls-session'
import { segmentFilename } from '@/player/segment-watcher'
import type { TranscodeFn } from '@/player/transcoder'

const HLS_SUBTITLE_CODECS = new Set(['subrip', 'ass', 'mov_text'])

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
  subtitleOffset: number
  port: number
  mediaId: string
}

export class HlsServer extends HlsSession {
  private server!: ReturnType<typeof Bun.serve>
  private serverOpts: HlsServerOpts

  constructor(opts: HlsServerOpts) {
    super({
      videoFilePath: opts.resolved.video.file_path,
      audioFilePath: opts.resolved.audio.file_path,
      videoStreamIndex: opts.resolved.video.stream_index,
      audioStreamIndex: opts.resolved.audio.stream_index,
      segments: opts.segments,
      audioOffset: opts.audioOffset,
      outDir: mkdtempSync(join(tmpdir(), 'omnarr-play-')),
      transcode: opts.transcode,
    })
    this.serverOpts = opts
  }

  get url() {
    return `http://localhost:${this.server.port}/${this.serverOpts.mediaId}/master.m3u8`
  }

  async start() {
    await Bun.write(join(this.opts.outDir, 'video.m3u8'), this.buildPlaylist())

    if (this.serverOpts.resolved.subtitle) {
      await this.convertSubtitle(
        this.serverOpts.resolved.subtitle,
        this.serverOpts.subtitleOffset
      )
      await Bun.write(
        join(this.opts.outDir, 'subs.m3u8'),
        this.buildSubtitlePlaylist()
      )
    }

    await Bun.write(
      join(this.opts.outDir, 'master.m3u8'),
      this.buildMasterPlaylist()
    )

    this.server = this.serve()
  }

  async stop() {
    this.server.stop()
    await this.cleanup()
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
        `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="${lang}",NAME="${name}",DEFAULT=NO,AUTOSELECT=YES,URI="subs.m3u8"`
      )
      lines.push('#EXT-X-STREAM-INF:BANDWIDTH=0,SUBTITLES="subs"')
    } else {
      lines.push('#EXT-X-STREAM-INF:BANDWIDTH=0')
    }

    lines.push('video.m3u8')

    return lines.join('\n')
  }

  private buildSubtitlePlaylist() {
    const totalDuration = this.opts.segments.reduce(
      (sum, s) => sum + s.duration,
      0
    )

    return [
      '#EXTM3U',
      `#EXT-X-TARGETDURATION:${Math.ceil(totalDuration)}`,
      '#EXT-X-PLAYLIST-TYPE:VOD',
      `#EXTINF:${totalDuration.toFixed(6)},`,
      'subs.vtt',
      '#EXT-X-ENDLIST',
    ].join('\n')
  }

  private async convertSubtitle(
    subtitle: ResolvedTrack,
    subtitleOffset: number
  ) {
    if (!HLS_SUBTITLE_CODECS.has(subtitle.codec_name)) {
      throw new Error(
        `Incompatible subtitle codec '${subtitle.codec_name}'. Supported: ${[...HLS_SUBTITLE_CODECS].join(', ')}.`
      )
    }

    await mkdir(this.opts.outDir, { recursive: true })

    let builder = new FFmpegBuilder({ overwrite: true })

    if (subtitleOffset !== 0) {
      builder = builder.rawInput('-itsoffset', String(subtitleOffset))
    }

    await builder
      .input(subtitle.file_path)
      .map(`0:${subtitle.stream_index}`)
      .output(join(this.opts.outDir, 'subs.vtt'))
      .run()
  }

  private serve() {
    const prefix = `/${this.serverOpts.mediaId}`

    return Bun.serve({
      port: this.serverOpts.port,
      idleTimeout: 255,
      fetch: async (req) => {
        const url = new URL(req.url)
        const raw = url.pathname

        if (!raw.startsWith(prefix)) {
          return new Response('Not Found', { status: 404 })
        }

        let pathname = raw.slice(prefix.length) || '/'

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

        const file = Bun.file(filePath)

        if (!(await file.exists())) {
          return new Response('Not Found', { status: 404 })
        }

        return new Response(file, {
          headers: {
            'Content-Type':
              HLS_CONTENT_TYPES[ext] ?? 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
          },
        })
      },
    })
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
        headers: {
          'Content-Type': 'video/mp2t',
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (err) {
      Log.error(
        `serve segment=${index} status=404 error=${err instanceof Error ? err.message : String(err)}`
      )

      return new Response('Not Found', { status: 404 })
    }
  }
}
