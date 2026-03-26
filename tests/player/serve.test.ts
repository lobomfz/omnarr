import { describe, expect, test, afterAll } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { HlsSession } from '@/hls-session'
import { Player } from '@/player'

import { MediaFixtures } from '../fixtures/media'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-serve-'))
const refMkv = join(tmpDir, 'ref.mkv')

await MediaFixtures.generate(refMkv)

const probe = await new FFmpegBuilder().input(refMkv).probe()
const keyframes = await new FFmpegBuilder().input(refMkv).probeKeyframes()

const hlsDir = join(tmpDir, 'hls')

await mkdir(hlsDir, { recursive: true })

const session = new HlsSession({
  videoFilePath: refMkv,
  audioFilePath: refMkv,
  videoStreamIndex: 0,
  audioStreamIndex: 1,
  keyframes,
  duration: probe.format.duration,
  outDir: hlsDir,
})

await Bun.write(join(hlsDir, 'video.m3u8'), session.getPlaylist())
await Bun.write(join(hlsDir, 'master.m3u8'), Player.masterPlaylist())

const mediaId = 'TEST01'
const server = Player.serve(hlsDir, session, 0, mediaId)
const base = `http://localhost:${server.port}/${mediaId}`

afterAll(async () => {
  server?.stop()
  await rm(tmpDir, { recursive: true })
})

describe('Player — HLS server', () => {
  test('serves master.m3u8 at root', async () => {
    const res = await fetch(`${base}/`)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.apple.mpegurl'
    )

    const text = await res.text()

    expect(text).toContain('#EXTM3U')
    expect(text).toContain('video.m3u8')
  })

  test('serves video.m3u8 media playlist', async () => {
    const res = await fetch(`${base}/video.m3u8`)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.apple.mpegurl'
    )

    const text = await res.text()

    expect(text).toContain('#EXTM3U')
    expect(text).toContain('#EXTINF:')
  })

  test('serves .ts segments with correct content type', async () => {
    const res = await fetch(`${base}/seg_000.ts`)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp2t')
  })

  test('returns 404 for missing files', async () => {
    const res = await fetch(`${base}/nonexistent.m3u8`)

    expect(res.status).toBe(404)
  })

  test('returns 404 for wrong mediaId prefix', async () => {
    const res = await fetch(`http://localhost:${server.port}/WRONG1/video.m3u8`)

    expect(res.status).toBe(404)
  })

  test('includes CORS header', async () => {
    const res = await fetch(`${base}/video.m3u8`)

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('blocks path traversal via double-slash absolute path', async () => {
    const siblingDir = hlsDir + '-evil'

    await Bun.write(join(siblingDir, 'secret.txt'), 'leaked')

    const req = new Request(`${base}/${siblingDir}/secret.txt`)
    const res = await server.fetch(req)

    expect(res.status).toBe(403)

    const body = await res.text()

    expect(body).not.toContain('leaked')
  })
})
