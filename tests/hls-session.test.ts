import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { HlsSession } from '@/hls-session'
import { Player } from '@/player'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-hlssession-'))
const testMkv = join(tmpDir, 'test.mkv')

let keyframes: number[]
let duration: number

beforeAll(async () => {
  await new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input('color=c=black:s=320x240:d=1:r=24')
    .rawInput('-f', 'lavfi')
    .input('anullsrc=r=48000:cl=stereo')
    .duration(1)
    .codec('v', 'libx264')
    .preset('ultrafast')
    .raw('-g', '8')
    .codec('a', 'aac')
    .output(testMkv)
    .run()

  const probe = await new FFmpegBuilder().input(testMkv).probe()

  keyframes = await new FFmpegBuilder().input(testMkv).probeKeyframes()
  duration = probe.format.duration
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

const COPY_STRATEGY = {
  video: { mode: 'copy' as const },
  audio: { mode: 'copy' as const },
}

function createSession(outDir: string) {
  return new HlsSession({
    videoFilePath: testMkv,
    audioFilePath: testMkv,
    videoStreamIndex: 0,
    audioStreamIndex: 1,
    keyframes,
    duration,
    outDir,
    codecStrategy: COPY_STRATEGY,
  })
}

describe('HlsSession', () => {
  test('getPlaylist returns m3u8 with EXTINF matching keyframe intervals', () => {
    const session = createSession(join(tmpDir, 'playlist'))
    const playlist = session.getPlaylist()

    expect(playlist).toContain('#EXTM3U')
    expect(playlist).toContain('#EXTINF:')

    const extinfs = playlist
      .split('\n')
      .filter((l) => l.startsWith('#EXTINF:'))
      .map((l) => parseFloat(l.slice('#EXTINF:'.length)))

    expect(extinfs).toHaveLength(keyframes.length)

    for (let i = 0; i < keyframes.length; i++) {
      const expected = (keyframes[i + 1] ?? duration) - keyframes[i]

      expect(extinfs[i]).toBeCloseTo(expected, 3)
    }
  })

  test('getPlaylist includes all segments with EXT-X-ENDLIST', () => {
    const session = createSession(join(tmpDir, 'complete'))
    const playlist = session.getPlaylist()

    expect(playlist).toContain('#EXT-X-ENDLIST')

    const segmentLines = playlist.split('\n').filter((l) => l.endsWith('.ts'))

    expect(segmentLines).toHaveLength(keyframes.length)
  })

  test('getPlaylist declares VOD playlist type', () => {
    const session = createSession(join(tmpDir, 'vod'))
    const playlist = session.getPlaylist()

    expect(playlist).toContain('#EXT-X-PLAYLIST-TYPE:VOD')
  })

  test('getPlaylist has no EXT-X-DISCONTINUITY tags', () => {
    const session = createSession(join(tmpDir, 'discont'))
    const playlist = session.getPlaylist()

    expect(playlist).not.toContain('#EXT-X-DISCONTINUITY')
  })

  test('getSegment starts continuous process and returns valid .ts', async () => {
    const outDir = join(tmpDir, 'segment')
    const session = createSession(outDir)

    const segPath = await session.getSegment(0)

    expect(await Bun.file(segPath).exists()).toBe(true)
    expect(Bun.file(segPath).size).toBeGreaterThan(0)

    const probe = await new FFmpegBuilder().input(segPath).probe()

    expect(probe.streams.length).toBeGreaterThan(0)

    await session.cleanup()
  })

  test('sequential segment requests are served from running process', async () => {
    const outDir = join(tmpDir, 'sequential')
    const session = createSession(outDir)

    for (let i = 0; i < keyframes.length; i++) {
      const segPath = await session.getSegment(i)

      expect(Bun.file(segPath).size).toBeGreaterThan(0)
    }

    await session.cleanup()
  })

  test('existing segment returns from disk without restart', async () => {
    const outDir = join(tmpDir, 'cached')
    const session = createSession(outDir)

    const first = await session.getSegment(0)
    const second = await session.getSegment(0)

    expect(second).toBe(first)

    await session.cleanup()
  })

  test('generated segment has video and audio streams', async () => {
    const outDir = join(tmpDir, 'valid')
    const session = createSession(outDir)

    const segPath = await session.getSegment(0)
    const probe = await new FFmpegBuilder().input(segPath).probe()

    const types = probe.streams.map((s) => s.codec_type)

    expect(types).toContain('video')
    expect(types).toContain('audio')

    await session.cleanup()
  })

  test('getSegment does not serve incomplete segment file', async () => {
    const outDir = join(tmpDir, 'incomplete')
    await mkdir(outDir, { recursive: true })

    // Simulate FFmpeg mid-write: file exists with some bytes but is truncated
    await Bun.write(join(outDir, 'seg_000.ts'), new Uint8Array(100))

    const session = createSession(outDir)
    const segPath = await session.getSegment(0)

    // Must return a real, complete segment — not the truncated stub
    expect(Bun.file(segPath).size).toBeGreaterThan(1000)

    await session.cleanup()
  })

  test('getSegment rejects out-of-range index', async () => {
    const outDir = join(tmpDir, 'out-of-range')
    const session = createSession(outDir)

    await expect(session.getSegment(999)).rejects.toThrow(
      /segment.*out of range/i
    )

    await session.cleanup()
  })

  test('getSegment rejects negative index', async () => {
    const outDir = join(tmpDir, 'negative')
    const session = createSession(outDir)

    await expect(session.getSegment(-1)).rejects.toThrow(
      /segment.*out of range/i
    )

    await session.cleanup()
  })

  test('rejects waiter when process exits without producing segment', async () => {
    const outDir = join(tmpDir, 'ffmpeg-crash')
    const session = new HlsSession({
      videoFilePath: '/tmp/nonexistent.mkv',
      audioFilePath: '/tmp/nonexistent.mkv',
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      keyframes: [0],
      duration: 1,
      outDir,
      codecStrategy: COPY_STRATEGY,
    })

    const result = await Promise.race([
      session.getSegment(0).then(
        () => 'resolved',
        () => 'rejected'
      ),
      Bun.sleep(500).then(() => 'hung'),
    ])

    expect(result).toBe('rejected')

    await session.cleanup()
  })

  test('cleanup kills process and removes all files', async () => {
    const outDir = join(tmpDir, 'cleanup')
    const session = createSession(outDir)

    await session.getSegment(0)

    const before = await Array.fromAsync(new Bun.Glob('*.ts').scan(outDir))

    expect(before.length).toBeGreaterThan(0)

    await session.cleanup()

    const after = await Array.fromAsync(
      new Bun.Glob('*.ts').scan(outDir)
    ).catch(() => [])

    expect(after).toHaveLength(0)
  })
})

describe('HlsSession — seek', () => {
  const seekDir = join(tmpDir, 'seek-fixtures')
  const seekMkv = join(seekDir, 'seek.mkv')
  let seekKeyframes: number[]
  let seekDuration: number

  beforeAll(async () => {
    await mkdir(seekDir, { recursive: true })

    await new FFmpegBuilder({ overwrite: true })
      .rawInput('-f', 'lavfi')
      .input('color=c=red:s=320x240:d=10:r=24')
      .rawInput('-f', 'lavfi')
      .input('anullsrc=r=48000:cl=stereo')
      .duration(10)
      .codec('v', 'libx264')
      .preset('ultrafast')
      .raw('-g', '12')
      .codec('a', 'aac')
      .output(seekMkv)
      .run()

    const probe = await new FFmpegBuilder().input(seekMkv).probe()

    seekKeyframes = await new FFmpegBuilder().input(seekMkv).probeKeyframes()
    seekDuration = probe.format.duration
  })

  function createSeekSession(outDir: string) {
    return new HlsSession({
      videoFilePath: seekMkv,
      audioFilePath: seekMkv,
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      keyframes: seekKeyframes,
      duration: seekDuration,
      outDir,
      codecStrategy: COPY_STRATEGY,
    })
  }

  test('requesting far segment starts process from that position', async () => {
    const outDir = join(seekDir, 'far-seek')
    const session = createSeekSession(outDir)

    const midIndex = Math.floor(seekKeyframes.length / 2)

    await session.getSegment(midIndex)

    // Segment 0 should NOT exist — FFmpeg started from midIndex, not 0
    expect(Bun.file(join(outDir, 'seg_000.ts')).size).toBe(0)

    await session.cleanup()
  })

  test('restart clears stale segments from previous process', async () => {
    const outDir = join(seekDir, 'stale-segments')
    await mkdir(outDir, { recursive: true })

    // Plant a fake stale segment that FFmpeg will never generate
    const staleFile = join(outDir, 'seg_999.ts')
    await Bun.write(staleFile, new Uint8Array(100))

    expect(Bun.file(staleFile).size).toBeGreaterThan(0)

    const session = createSeekSession(outDir)

    // Starting a process triggers clearSegments, removing all .ts files
    await session.getSegment(0)

    expect(Bun.file(staleFile).size).toBe(0)

    await session.cleanup()
  })
})

describe('HlsSession — integration: dual-file', () => {
  const integrationDir = join(tmpDir, 'integration')
  const videoFile = join(integrationDir, 'video.mkv')
  const audioFile = join(integrationDir, 'audio.mp4')
  let longKeyframes: number[]
  let longDuration: number
  let server: ReturnType<typeof Bun.serve>
  let session: HlsSession
  let baseUrl: string
  let hlsDir: string

  beforeAll(async () => {
    await mkdir(integrationDir, { recursive: true })

    await Promise.all([
      new FFmpegBuilder({ overwrite: true })
        .rawInput('-f', 'lavfi')
        .input('color=c=blue:s=320x240:d=60:r=24')
        .rawInput('-f', 'lavfi')
        .input('anullsrc=r=48000:cl=stereo')
        .duration(60)
        .codec('v', 'libx264')
        .preset('medium')
        .raw('-bf', '2', '-g', '48')
        .codec('a', 'aac')
        .output(videoFile)
        .run(),
      new FFmpegBuilder({ overwrite: true })
        .rawInput('-f', 'lavfi')
        .input('sine=frequency=440:duration=60')
        .codec('a', 'aac')
        .output(audioFile)
        .run(),
    ])

    const probe = await new FFmpegBuilder().input(videoFile).probe()

    longKeyframes = await new FFmpegBuilder().input(videoFile).probeKeyframes()
    longDuration = probe.format.duration

    hlsDir = join(integrationDir, 'hls')

    await mkdir(hlsDir, { recursive: true })

    session = new HlsSession({
      videoFilePath: videoFile,
      audioFilePath: audioFile,
      videoStreamIndex: 0,
      audioStreamIndex: 0,
      keyframes: longKeyframes,
      duration: longDuration,
      outDir: hlsDir,
      codecStrategy: COPY_STRATEGY,
    })

    await Bun.write(join(hlsDir, 'video.m3u8'), session.getPlaylist())

    server = Player.serve(hlsDir, session, 0, 'HLSTEST')
    baseUrl = `http://localhost:${server.port}/HLSTEST`
  })

  afterAll(async () => {
    server?.stop()
    await session?.cleanup()
  })

  test('HLS demuxer plays full stream without packet errors', async () => {
    const proc = Bun.spawn(
      [
        'ffmpeg',
        '-y',
        '-i',
        `${baseUrl}/video.m3u8`,
        '-c',
        'copy',
        '-f',
        'null',
        '-',
      ],
      { stdout: 'ignore', stderr: 'pipe' }
    )

    const stderr = await new Response(proc.stderr).text()

    await proc.exited

    const corruptCount = (stderr.match(/Packet corrupt/g) || []).length
    const wrappedCount = (stderr.match(/sequence may have been wrapped/g) || [])
      .length

    expect(corruptCount).toBe(0)
    expect(wrappedCount).toBe(0)
  })
})
