import { describe, expect, test, afterAll } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { HlsServer } from '@/player/hls-server'
import { Transcoder } from '@/player/transcoder'

import { MediaFixtures } from '../fixtures/media'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-serve-'))
const refMkv = join(tmpDir, 'ref.mkv')

await MediaFixtures.generate(refMkv)

const probe = await new FFmpegBuilder().input(refMkv).probe()
const keyframes = await new FFmpegBuilder().input(refMkv).probeKeyframes()
const segments = keyframes.map((pts, i) => ({
  pts_time: pts,
  duration: (keyframes[i + 1] ?? probe.format.duration) - pts,
}))

const mediaId = 'TEST01'

const server = new HlsServer({
  resolved: {
    video: {
      file_path: refMkv,
      stream_index: 0,
      codec_name: 'h264',
      language: null,
      title: null,
    },
    audio: {
      file_path: refMkv,
      stream_index: 1,
      codec_name: 'aac',
      language: null,
      title: null,
    },
    subtitle: null,
  },
  segments,
  transcode: await Transcoder.init(
    { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
    { video_crf: 21, video_preset: 'veryfast' }
  ),
  audioOffset: 0,
  audioSpeed: 1,
  subtitleOffset: 0,
  subtitleSpeed: 1,
  mediaId,
})

await server.start()

const base = `http://localhost/hls/${mediaId}`

afterAll(async () => {
  await server.stop()
  await rm(tmpDir, { recursive: true })
})

describe('HlsServer', () => {
  test('serves master.m3u8 at root', async () => {
    const res = await server.handle(new Request(`${base}/`))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.apple.mpegurl'
    )

    const text = await res.text()

    expect(text).toContain('#EXTM3U')
    expect(text).toContain('video.m3u8')
  })

  test('serves video.m3u8 media playlist', async () => {
    const res = await server.handle(new Request(`${base}/video.m3u8`))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.apple.mpegurl'
    )

    const text = await res.text()

    expect(text).toContain('#EXTM3U')
    expect(text).toContain('#EXTINF:')
  })

  test('serves .ts segments with correct content type', async () => {
    const res = await server.handle(new Request(`${base}/seg_000.ts`))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp2t')
  })

  test('returns 404 for missing files', async () => {
    const res = await server.handle(new Request(`${base}/nonexistent.m3u8`))

    expect(res.status).toBe(404)
  })

  test('blocks path traversal outside outDir', async () => {
    // URL normalization resolves `..` segments before the handler sees
    // the pathname, so the path no longer starts with the mediaId prefix
    // and the request is rejected with 404 (prefix mismatch).
    const res = await server.handle(new Request(`${base};../../../tmp/outside`))

    expect(res.status).toBe(404)
  })

  test('returns 404 for wrong mediaId prefix', async () => {
    const res = await server.handle(
      new Request(`http://localhost/hls/WRONG1/video.m3u8`)
    )

    expect(res.status).toBe(404)
  })
})
