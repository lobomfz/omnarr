import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import '@/api/arktype'
import { PlayerSessionManager } from '@/player/player-session'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

describe('PlayerSession', () => {
  let session: PlayerSessionManager

  beforeEach(() => {
    session = new PlayerSessionManager()
  })

  afterEach(async () => {
    await session.stop()
  })

  test('stop with no session is a no-op', async () => {
    expect(session.active).toBe(false)

    await session.stop()

    expect(session.active).toBe(false)
  })

  test('handle returns 404 when no session is active', async () => {
    const req = new Request('http://localhost/hls/ABC123/master.m3u8')
    const res = await session.handle(req)

    expect(res.status).toBe(404)
  })

  test('handle delegates to active HlsServer and returns playlist', async () => {
    const { media, video, audio } = await TestSeed.player.movieWithTracks()

    await session.start({
      media_id: media.id,
      video: video.id,
      audio: audio.id,
    })

    const req = new Request(`http://localhost/hls/${media.id}/master.m3u8`)
    const res = await session.handle(req)

    expect(res.status).toBe(200)

    const body = await res.text()

    expect(body).toContain('#EXTM3U')
    expect(body).toContain('video.m3u8')
  })

  test('handle returns 404 for unknown path under active session', async () => {
    const { media, video, audio } = await TestSeed.player.movieWithTracks()

    await session.start({
      media_id: media.id,
      video: video.id,
      audio: audio.id,
    })

    const req = new Request(`http://localhost/hls/${media.id}/nonexistent.xyz`)
    const res = await session.handle(req)

    expect(res.status).toBe(404)
  })

  test('session is killed after inactivity timeout', async () => {
    session = new PlayerSessionManager(100)

    const { media, video, audio } = await TestSeed.player.movieWithTracks()

    await session.start({
      media_id: media.id,
      video: video.id,
      audio: audio.id,
    })

    expect(session.active).toBe(true)

    await Bun.sleep(200)

    expect(session.active).toBe(false)
  })

  test('activity resets the inactivity timer', async () => {
    session = new PlayerSessionManager(150)

    const { media, video, audio } = await TestSeed.player.movieWithTracks()

    await session.start({
      media_id: media.id,
      video: video.id,
      audio: audio.id,
    })

    await Bun.sleep(100)

    const req = new Request(`http://localhost/hls/${media.id}/master.m3u8`)
    await session.handle(req)

    await Bun.sleep(100)

    expect(session.active).toBe(true)

    await Bun.sleep(200)

    expect(session.active).toBe(false)
  })
})
