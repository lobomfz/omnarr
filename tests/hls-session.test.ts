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

  segments = keyframes.map((pts, i) => ({
    pts_time: pts,
    duration: (keyframes[i + 1] ?? probe.format.duration) - pts,
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

function createSession(
  outDir: string,
  opts?: { audioOffset?: number; audioSpeed?: number }
) {
  return new HlsSession({
    videoFilePath: testMkv,
    audioFilePath: testMkv,
    videoStreamIndex: 0,
    audioStreamIndex: 1,
    audioOffset: opts?.audioOffset ?? 0,
    audioSpeed: opts?.audioSpeed ?? 1,
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

    expect(() => session.getSegment(999)).toThrow(/segment.*out of range/i)

    await session.cleanup()
  })

  test('getSegment rejects negative index', async () => {
    const outDir = join(tmpDir, 'negative')
    const session = createSession(outDir)

    expect(() => session.getSegment(-1)).toThrow(/segment.*out of range/i)

    await session.cleanup()
  })

  test('rejects waiter when process exits without producing segment', async () => {
    const outDir = join(tmpDir, 'ffmpeg-crash')
    const session = new HlsSession({
      videoFilePath: '/tmp/nonexistent.mkv',
      audioFilePath: '/tmp/nonexistent.mkv',
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      audioOffset: 0,
      audioSpeed: 1,
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
    seekSegments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? probe.format.duration) - pts,
    }))
  })

  function createSeekSession(outDir: string) {
    return new HlsSession({
      videoFilePath: seekMkv,
      audioFilePath: seekMkv,
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      audioOffset: 0,
      audioSpeed: 1,
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
})

class TestableHlsSession extends HlsSession {
  getArgs(fromIndex: number) {
    return this.buildCommand(fromIndex).toArgs()
  }
}

describe('HlsSession — audioOffset', () => {
  test('audioOffset = 0 → no -itsoffset in FFmpeg args', () => {
    const session = new TestableHlsSession({
      videoFilePath: testMkv,
      audioFilePath: testMkv + '.audio',
      videoStreamIndex: 0,
      audioStreamIndex: 0,
      audioOffset: 0,
      audioSpeed: 1,
      segments: [{ pts_time: 0, duration: 1 }],
      outDir: join(tmpDir, 'offset-zero'),
      transcode: copyTranscode,
    })

    const args = session.getArgs(0)

    expect(args).not.toContain('-itsoffset')
  })

  test('audioOffset != 0 → -itsoffset appears before audio input', () => {
    const audioPath = testMkv + '.audio'

    const session = new TestableHlsSession({
      videoFilePath: testMkv,
      audioFilePath: audioPath,
      videoStreamIndex: 0,
      audioStreamIndex: 0,
      audioOffset: -3.5,
      audioSpeed: 1,
      segments: [{ pts_time: 0, duration: 1 }],
      outDir: join(tmpDir, 'offset-applied'),
      transcode: copyTranscode,
    })

    const args = session.getArgs(0)

    const itsoffsetIdx = args.indexOf('-itsoffset')
    const audioInputIdx = args.indexOf(audioPath)

    expect(itsoffsetIdx).toBeGreaterThan(-1)
    expect(args[itsoffsetIdx + 1]).toBe('-3.5')
    expect(itsoffsetIdx).toBeLessThan(audioInputIdx)
  })
})

describe('HlsSession — audioSpeed', () => {
  test('audioSpeed = 1 → no -filter:a in FFmpeg args, -c:a copy present for AAC', async () => {
    const transcode = await Transcoder.init(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
      { video_crf: 21, video_preset: 'veryfast' },
      1
    )

    const session = new TestableHlsSession({
      videoFilePath: testMkv,
      audioFilePath: testMkv + '.audio',
      videoStreamIndex: 0,
      audioStreamIndex: 0,
      audioOffset: 0,
      audioSpeed: 1,
      segments: [{ pts_time: 0, duration: 1 }],
      outDir: join(tmpDir, 'speed-one'),
      transcode,
    })

    const args = session.getArgs(0)

    expect(args).not.toContain('-filter:a')
    expect(args).not.toContain('-af')

    const codecIdx = args.indexOf('-c:a')

    expect(codecIdx).toBeGreaterThan(-1)
    expect(args[codecIdx + 1]).toBe('copy')
  })

  test('audioSpeed != 1 → -filter:a atempo=<speed> present, -c:a copy absent', async () => {
    const transcode = await Transcoder.init(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
      { video_crf: 21, video_preset: 'veryfast' },
      1.0448
    )

    const session = new TestableHlsSession({
      videoFilePath: testMkv,
      audioFilePath: testMkv + '.audio',
      videoStreamIndex: 0,
      audioStreamIndex: 0,
      audioOffset: 0,
      audioSpeed: 1.0448,
      segments: [{ pts_time: 0, duration: 1 }],
      outDir: join(tmpDir, 'speed-applied'),
      transcode,
    })

    const args = session.getArgs(0)

    const filterIdx = args.indexOf('-filter:a')

    expect(filterIdx).toBeGreaterThan(-1)
    expect(args[filterIdx + 1]).toBe('atempo=1.0448')

    const codecIdx = args.indexOf('-c:a')

    expect(codecIdx).toBeGreaterThan(-1)
    expect(args[codecIdx + 1]).toBe('aac')
  })

  test('audioSpeed > 2 → chained atempo=2.0 plus remainder', async () => {
    const transcode = await Transcoder.init(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
      { video_crf: 21, video_preset: 'veryfast' },
      2.5
    )

    const session = new TestableHlsSession({
      videoFilePath: testMkv,
      audioFilePath: testMkv + '.audio',
      videoStreamIndex: 0,
      audioStreamIndex: 0,
      audioOffset: 0,
      audioSpeed: 2.5,
      segments: [{ pts_time: 0, duration: 1 }],
      outDir: join(tmpDir, 'speed-chain-high'),
      transcode,
    })

    const args = session.getArgs(0)

    const filterIdx = args.indexOf('-filter:a')

    expect(filterIdx).toBeGreaterThan(-1)
    expect(args[filterIdx + 1]).toBe('atempo=2.0,atempo=1.25')
  })

  test('audioSpeed < 0.5 → chained atempo=0.5 plus remainder', async () => {
    const transcode = await Transcoder.init(
      { video: { codec_name: 'h264' }, audio: { codec_name: 'aac' } },
      { video_crf: 21, video_preset: 'veryfast' },
      0.3
    )

    const session = new TestableHlsSession({
      videoFilePath: testMkv,
      audioFilePath: testMkv + '.audio',
      videoStreamIndex: 0,
      audioStreamIndex: 0,
      audioOffset: 0,
      audioSpeed: 0.3,
      segments: [{ pts_time: 0, duration: 1 }],
      outDir: join(tmpDir, 'speed-chain-low'),
      transcode,
    })

    const args = session.getArgs(0)

    const filterIdx = args.indexOf('-filter:a')

    expect(filterIdx).toBeGreaterThan(-1)
    expect(args[filterIdx + 1]).toBe('atempo=0.5,atempo=0.6')
  })
})

describe('HlsSession — seek with synced external audio', () => {
  test('restart seek reopens external audio at its sync-adjusted source time', () => {
    const audioPath = testMkv + '.audio'
    const speed = 1.04416
    const offset = -1.9013684489592921
    const seekTime = 120

    const session = new TestableHlsSession({
      videoFilePath: testMkv,
      audioFilePath: audioPath,
      videoStreamIndex: 0,
      audioStreamIndex: 0,
      audioOffset: offset,
      audioSpeed: speed,
      segments: [
        { pts_time: 0, duration: 10 },
        { pts_time: seekTime, duration: 10 },
      ],
      outDir: join(tmpDir, 'seek-audio-sync'),
      transcode: copyTranscode,
    })

    const args = session.getArgs(1)
    const seekValues = args.flatMap((value, index) =>
      value === '-ss' ? [parseFloat(args[index + 1])] : []
    )
    const expectedAudioSeek = (seekTime - offset) * speed

    expect(seekValues).toHaveLength(2)
    expect(seekValues[0]).toBe(seekTime)
    expect(seekValues[1]).toBeCloseTo(expectedAudioSeek, 6)
  })

  test('restart seek clamps audio seek to 0 when sync-adjusted time would be negative', () => {
    const audioPath = testMkv + '.audio'
    const seekTime = 2
    // audio starts 5s into video → (2−5)×1 = −3 without clamp
    const offset = 5

    const session = new TestableHlsSession({
      videoFilePath: testMkv,
      audioFilePath: audioPath,
      videoStreamIndex: 0,
      audioStreamIndex: 0,
      audioOffset: offset,
      audioSpeed: 1,
      segments: [
        { pts_time: 0, duration: 10 },
        { pts_time: seekTime, duration: 10 },
      ],
      outDir: join(tmpDir, 'seek-audio-clamp'),
      transcode: copyTranscode,
    })

    const args = session.getArgs(1)
    const seekValues = args.flatMap((value, index) =>
      value === '-ss' ? [parseFloat(args[index + 1])] : []
    )

    expect(seekValues[0]).toBe(seekTime)
    expect(seekValues.every((v) => v >= 0)).toBe(true)
  })
})

describe('HlsSession — integration: dual-file', () => {
  const integrationDir = join(tmpDir, 'integration')
  const videoFile = join(integrationDir, 'video.mkv')
  const audioFile = join(integrationDir, 'audio.mp4')
  let hlsServer: HlsServer
  let testServer: ReturnType<typeof Bun.serve>

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
    const longSegments = keyframes.map((pts, i) => ({
      pts_time: pts,
      duration: (keyframes[i + 1] ?? probe.format.duration) - pts,
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
      audioOffset: 0,
      audioSpeed: 1,
      subtitleOffset: 0,
      subtitleSpeed: 1,
      mediaId: 'HLSTEST',
    })

    await hlsServer.start()

    testServer = Bun.serve({
      port: 0,
      fetch: (req) => hlsServer.handle(req),
    })
  })

  afterAll(async () => {
    void testServer.stop(true)
    await hlsServer.stop()
  })

  test('HLS demuxer plays full stream without packet errors', async () => {
    const hlsUrl = `http://localhost:${testServer.port}${hlsServer.hlsPath}`
    const proc = Bun.spawn(
      ['ffmpeg', '-y', '-i', hlsUrl, '-c', 'copy', '-f', 'null', '-'],
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
