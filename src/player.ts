import { mkdir, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { config } from '@/config'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbMediaTracks } from '@/db/media-tracks'
import { HlsSession } from '@/hls-session'
import { Log } from '@/log'
import { Transcoder } from '@/transcoder'

const HLS_SUBTITLE_CODECS = ['subrip', 'ass', 'mov_text']

const HLS_CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.vtt': 'text/vtt',
}

type TrackSelection = {
  video?: number
  audio?: number
  sub?: number
}

export class Player {
  private hlsDir?: string
  private server?: ReturnType<typeof Bun.serve>
  private session?: HlsSession

  constructor(private mediaId: string) {}

  async start(selection: TrackSelection, opts: { port?: number }) {
    const resolved = await this.resolveTracks(selection)

    const transcoder = await Transcoder.create(resolved, config.transcoding)

    if (resolved.subtitle) {
      this.validateSubtitleCodec(resolved.subtitle.codec_name)
    }

    this.hlsDir = await mkdtemp(join(tmpdir(), 'omnarr-play-'))

    if (!resolved.video.file_duration) {
      throw new Error('Media file not scanned. Run scan first.')
    }

    const keyframes = await DbMediaKeyframes.getByFileId(resolved.video.file_id)

    if (keyframes.length === 0) {
      throw new Error('No keyframes found. Run scan first.')
    }

    Log.info(
      `player start keyframes=${keyframes.length} duration=${resolved.video.file_duration} video=${resolved.video.file_path} audio=${resolved.audio.file_path}`
    )

    this.session = new HlsSession({
      videoFilePath: resolved.video.file_path,
      audioFilePath: resolved.audio.file_path,
      videoStreamIndex: resolved.video.stream_index,
      audioStreamIndex: resolved.audio.stream_index,
      keyframes: keyframes.map((k) => k.pts_time),
      duration: resolved.video.file_duration,
      outDir: this.hlsDir,
      transcoder,
    })

    await Bun.write(join(this.hlsDir, 'video.m3u8'), this.session.getPlaylist())

    if (resolved.subtitle) {
      await Player.convertSubtitle(resolved.subtitle, this.hlsDir)
    }

    await Bun.write(
      join(this.hlsDir, 'master.m3u8'),
      Player.masterPlaylist(
        resolved.subtitle
          ? {
              language: resolved.subtitle.language,
              name: resolved.subtitle.title,
            }
          : undefined
      )
    )

    this.server = Player.serve(
      this.hlsDir,
      this.session,
      opts.port ?? 8787,
      this.mediaId
    )

    return {
      url: `http://localhost:${this.server.port}/${this.mediaId}/master.m3u8`,
      ...resolved,
    }
  }

  async stop() {
    this.server?.stop()

    if (this.session) {
      await this.session.cleanup()
    }
  }

  async play(url: string) {
    const proc = Bun.spawn(['mpv', url], {
      stdio: ['inherit', 'inherit', 'inherit'],
    })

    await proc.exited
    await this.stop()
  }

  async resolveTracks(selection: TrackSelection) {
    const allTracks = await DbMediaTracks.getWithFileByMediaId(this.mediaId)

    if (allTracks.length === 0) {
      throw new Error(`No tracks found for media '${this.mediaId}'.`)
    }

    const byType = Map.groupBy(allTracks, (t) => t.stream_type)

    const video = this.pickTrack(byType.get('video'), 'video', selection.video)
    const audio = this.pickTrack(byType.get('audio'), 'audio', selection.audio)

    if (selection.sub === undefined) {
      return { video, audio, subtitle: null }
    }

    const subtitle = this.pickTrack(
      byType.get('subtitle'),
      'subtitle',
      selection.sub
    )

    return { video, audio, subtitle }
  }

  private pickTrack(
    tracks:
      | Awaited<ReturnType<typeof DbMediaTracks.getWithFileByMediaId>>
      | undefined,
    type: string,
    index?: number
  ) {
    if (!tracks || tracks.length === 0) {
      throw new Error(`No ${type} tracks found.`)
    }

    if (index !== undefined) {
      if (index < 0 || index >= tracks.length) {
        throw new Error(
          `${type} index ${index} out of range (0-${tracks.length - 1}).`
        )
      }

      return tracks[index]
    }

    const mostRecentDownloadId = tracks[0].download_id
    const fromLatest = tracks.filter(
      (t) => t.download_id === mostRecentDownloadId && t.is_default
    )

    if (fromLatest.length > 0) {
      return fromLatest[0]
    }

    return tracks[0]
  }

  private validateSubtitleCodec(codec: string) {
    if (!HLS_SUBTITLE_CODECS.includes(codec)) {
      throw new Error(
        `Incompatible subtitle codec '${codec}'. Supported: ${HLS_SUBTITLE_CODECS.join(', ')}.`
      )
    }
  }

  static serve(
    hlsDir: string,
    session: HlsSession,
    port: number,
    mediaId: string
  ) {
    const prefix = `/${mediaId}`

    return Bun.serve({
      port,
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

        const filePath = resolve(hlsDir, pathname.slice(1))

        if (!filePath.startsWith(hlsDir + '/')) {
          return new Response('Forbidden', { status: 403 })
        }

        const ext = pathname.slice(pathname.lastIndexOf('.'))

        if (ext === '.ts') {
          const match = pathname.match(/seg_(\d+)\.ts$/)

          if (match) {
            const index = parseInt(match[1], 10)

            try {
              const start = performance.now()
              const segPath = await session.getSegment(index)
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

  static async convertSubtitle(
    subtitle: { file_path: string; stream_index: number },
    outDir: string
  ) {
    await mkdir(outDir, { recursive: true })

    await new FFmpegBuilder({ overwrite: true })
      .input(subtitle.file_path)
      .map(`0:${subtitle.stream_index}`)
      .output(join(outDir, 'subs.vtt'))
      .run()
  }

  static masterPlaylist(subtitle?: {
    language: string | null
    name: string | null
  }) {
    const lines = ['#EXTM3U']

    if (subtitle) {
      const lang = subtitle.language ?? 'und'
      const name = subtitle.name ?? 'Subtitle'

      lines.push(
        `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="${lang}",NAME="${name}",DEFAULT=NO,AUTOSELECT=YES,URI="subs.vtt"`
      )
      lines.push('#EXT-X-STREAM-INF:BANDWIDTH=0,SUBTITLES="subs"')
    } else {
      lines.push('#EXT-X-STREAM-INF:BANDWIDTH=0')
    }

    lines.push('video.m3u8')

    return lines.join('\n')
  }
}
