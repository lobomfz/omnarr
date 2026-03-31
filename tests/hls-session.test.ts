import { describe, expect, test, beforeAll, afterAll, spyOn } from 'bun:test'
import * as fsPromises from 'fs/promises'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { HlsServer } from '@/player/hls-server'
import { HlsSession } from '@/player/hls-session'
import { Transcoder } from '@/player/transcoder'

const originalAccess = fsPromises.access.bind(fsPromises)
const vaapiSpy = spyOn(fsPromises, 'access').mockImplementation((path: any) => {
  if (path === '/dev/dri/renderD128') {
    return Promise.reject(new Error('ENOENT'))
  }

  return originalAccess(path)
})

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-hlssession-'))
const testMkv = join(tmpDir, 'test.mkv')

let segments: { pts_time: number; duration: number }[]

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
  const keyframes = await new FFmpegBuilder().input(testMkv).probeKeyframes()
  const duration = probe.format.duration

  segments = keyframes.map((pts, i) => ({
    pts_time: pts,
    duration: (keyframes[i + 1] ?? duration) - pts,
  }))
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

const copyTranscode = await Transcoder.init(
  { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
  { video_crf: 21, video_preset: 'veryfast' }
)

vaapiSpy.mockRestore()

function createSession(outDir: string) {
  return new HlsSession({
    videoFilePath: testMkv,
    audioFilePath: testMkv,
    videoStreamIndex: 0,
    audioStreamIndex: 1,
    segments,
    outDir,
    transcode: copyTranscode,
  })
}

describe('HlsSession', () => {
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

    for (let i = 0; i < segments.length; i++) {
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

    await Bun.write(join(outDir, 'seg_000.ts'), new Uint8Array(100))

    const session = createSession(outDir)
    const segPath = await session.getSegment(0)

    expect(Bun.file(segPath).size).toBeGreaterThan(1000)

    await session.cleanup()
  })

  test('getSegment rejects out-of-range index', async () => {
    const outDir = join(tmpDir, 'out-of-range')
    const session = createSession(outDir)

    await expect(() => session.getSegment(999)).toThrow(
      /segment.*out of range/i
    )

    await session.cleanup()
  })

  test('getSegment rejects negative index', async () => {
    const outDir = join(tmpDir, 'negative')
    const session = createSession(outDir)

    await expect(() => session.getSegment(-1)).toThrow(/segment.*out of range/i)

    await session.cleanup()
  })

  test('rejects waiter when process exits without producing segment', async () => {
    const outDir = join(tmpDir, 'ffmpeg-crash')
    const session = new HlsSession({
      videoFilePath: '/tmp/nonexistent.mkv',
      audioFilePath: '/tmp/nonexistent.mkv',
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      segments: [{ pts_time: 0, duration: 1 }],
      outDir,
      transcode: copyTranscode,
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
  let seekSegments: { pts_time: number; duration: number }[]

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
    const keyframes = await new FFmpegBuilder().input(seekMkv).probeKeyframes()
    const duration = probe.format.duration

    seekSegments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? duration) - pts,
    }))
  })

  function createSeekSession(outDir: string) {
    return new HlsSession({
      videoFilePath: seekMkv,
      audioFilePath: seekMkv,
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      segments: seekSegments,
      outDir,
      transcode: copyTranscode,
    })
  }

  test('requesting far segment starts process from that position', async () => {
    const outDir = join(seekDir, 'far-seek')
    const session = createSeekSession(outDir)

    const midIndex = Math.floor(seekSegments.length / 2)

    await session.getSegment(midIndex)

    expect(Bun.file(join(outDir, 'seg_000.ts')).size).toBe(0)

    await session.cleanup()
  })

  test('restart clears stale segments from previous process', async () => {
    const outDir = join(seekDir, 'stale-segments')
    await mkdir(outDir, { recursive: true })

    const staleFile = join(outDir, 'seg_999.ts')
    await Bun.write(staleFile, new Uint8Array(100))

    expect(Bun.file(staleFile).size).toBeGreaterThan(0)

    const session = createSeekSession(outDir)

    await session.getSegment(0)

    expect(Bun.file(staleFile).size).toBe(0)

    await session.cleanup()
  })
})

describe('HlsSession — integration: dual-file', () => {
  const integrationDir = join(tmpDir, 'integration')
  const videoFile = join(integrationDir, 'video.mkv')
  const audioFile = join(integrationDir, 'audio.mp4')
  let hlsServer: HlsServer

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
    const keyframes = await new FFmpegBuilder()
      .input(videoFile)
      .probeKeyframes()
    const duration = probe.format.duration

    const longSegments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? duration) - pts,
    }))

    hlsServer = new HlsServer({
      resolved: {
        video: {
          file_path: videoFile,
          stream_index: 0,
          codec_name: 'h264',
          language: null,
          title: null,
        },
        audio: {
          file_path: audioFile,
          stream_index: 0,
          codec_name: 'aac',
          language: null,
          title: null,
        },
        subtitle: null,
      },
      segments: longSegments,
      transcode: copyTranscode,
      port: 0,
      mediaId: 'HLSTEST',
    })

    await hlsServer.start()
  })

  afterAll(async () => {
    await hlsServer?.stop()
  })

  test('HLS demuxer plays full stream without packet errors', async () => {
    const proc = Bun.spawn(
      ['ffmpeg', '-y', '-i', hlsServer.url, '-c', 'copy', '-f', 'null', '-'],
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
