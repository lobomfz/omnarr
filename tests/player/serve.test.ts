import { describe, expect, test, afterAll } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { database } from '@/db/connection'
import { Player } from '@/player'

import { MediaFixtures } from '../fixtures/media'
import { seedMedia, seedDownloadWithTracks } from './seed'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-serve-'))
const refMkv = join(tmpDir, 'ref.mkv')

await MediaFixtures.generate(refMkv)

database.reset()

const media = await seedMedia()
const filePath = join(tmpDir, 'movie.mkv')

await MediaFixtures.copy(refMkv, filePath)

await seedDownloadWithTracks(media.id, 'serve_hash', filePath, [
  {
    stream_index: 0,
    stream_type: 'video',
    codec_name: 'h264',
    is_default: true,
    width: 320,
    height: 240,
  },
  {
    stream_index: 1,
    stream_type: 'audio',
    codec_name: 'aac',
    is_default: true,
  },
])

const player = new Player(media.id)
const resolved = await player.resolveTracks({})
const hlsDir = join(tmpDir, 'hls')

await player.generateHls(resolved, hlsDir)
await Bun.write(join(hlsDir, 'master.m3u8'), Player.masterPlaylist())

const server = Player.serve(hlsDir, 0)

afterAll(async () => {
  server?.stop()
  database.reset()
  await rm(tmpDir, { recursive: true })
})

describe('Player — HLS server', () => {
  test('serves master.m3u8 at root', async () => {
    const res = await fetch(`http://localhost:${server.port}/`)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.apple.mpegurl'
    )

    const text = await res.text()

    expect(text).toContain('#EXTM3U')
    expect(text).toContain('video.m3u8')
  })

  test('serves video.m3u8 media playlist', async () => {
    const res = await fetch(`http://localhost:${server.port}/video.m3u8`)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.apple.mpegurl'
    )

    const text = await res.text()

    expect(text).toContain('#EXTM3U')
    expect(text).toContain('#EXTINF:')
  })

  test('serves .ts segments with correct content type', async () => {
    const segments = await Array.fromAsync(new Bun.Glob('*.ts').scan(hlsDir))

    expect(segments.length).toBeGreaterThan(0)

    const res = await fetch(`http://localhost:${server.port}/${segments[0]}`)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp2t')
  })

  test('returns 404 for missing files', async () => {
    const res = await fetch(`http://localhost:${server.port}/nonexistent.ts`)

    expect(res.status).toBe(404)
  })

  test('includes CORS header', async () => {
    const res = await fetch(`http://localhost:${server.port}/video.m3u8`)

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('blocks path traversal via double-slash absolute path', async () => {
    const siblingDir = hlsDir + '-evil'

    await Bun.write(join(siblingDir, 'secret.txt'), 'leaked')

    const req = new Request(
      `http://localhost:${server.port}/${siblingDir}/secret.txt`
    )
    const res = await server.fetch(req)

    expect(res.status).toBe(403)

    const body = await res.text()

    expect(body).not.toContain('leaked')
  })
})
