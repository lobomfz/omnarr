import {
  afterEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
  beforeEach,
} from 'bun:test'
import * as fsPromises from 'fs/promises'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'

import { DbMediaTracks } from '@/db/media-tracks'
import { config } from '@/lib/config'
import { Player } from '@/player/player'
import { Transcoder } from '@/player/transcoder'

import { TestSeed } from '../helpers/seed'

const originalAccess = fsPromises.access.bind(fsPromises)

afterEach(() => {
  mock.restore()
})

function argAfter(args: string[], flag: string) {
  const idx = args.indexOf(flag)

  if (idx < 0) {
    return
  }

  return args[idx + 1]
}

beforeEach(() => {
  TestSeed.reset()

  spyOn(fsPromises, 'access').mockImplementation((path: any) => {
    if (path === '/dev/dri/renderD128') {
      return Promise.reject(new Error('ENOENT'))
    }

    return originalAccess(path)
  })
})

async function seedAndGetTrackIds(
  mediaId: string,
  tracks: Parameters<typeof TestSeed.player.downloadWithTracks>[3],
  opts?: Parameters<typeof TestSeed.player.downloadWithTracks>[4]
) {
  const { file } = await TestSeed.player.downloadWithTracks(
    mediaId,
    'hash1',
    '/movies/movie.mkv',
    tracks,
    opts
  )

  const allTracks = await DbMediaTracks.getByMediaFileId(file.id)

  return {
    file,
    video: allTracks.find((t) => t.stream_type === 'video')!,
    audio: allTracks.find((t) => t.stream_type === 'audio')!,
    subtitle: allTracks.find((t) => t.stream_type === 'subtitle'),
  }
}

describe('Player — transcoder resolution', () => {
  test('compatible codecs produce copy strategy', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const ids = await seedAndGetTrackIds(media.id, [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        channels: 6,
        channel_layout: '5.1',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: ids.video.id,
      audio: ids.audio.id,
    })
    const transcode = await Transcoder.init(resolved, config.transcoding)

    const args = transcode(new FFmpegBuilder().input('/test.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('copy')
  })

  test('incompatible video codec produces transcode strategy', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const ids = await seedAndGetTrackIds(media.id, [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'av1',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
        channels: 2,
        channel_layout: 'stereo',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: ids.video.id,
      audio: ids.audio.id,
    })
    const transcode = await Transcoder.init(resolved, config.transcoding)

    const args = transcode(new FFmpegBuilder().input('/test.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-c:a')).toBe('copy')
  })

  test('incompatible audio codec produces transcode with channel preservation', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const ids = await seedAndGetTrackIds(media.id, [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'dts',
        is_default: true,
        channels: 6,
        channel_layout: '5.1',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: ids.video.id,
      audio: ids.audio.id,
    })
    const transcode = await Transcoder.init(resolved, config.transcoding)

    const args = transcode(new FFmpegBuilder().input('/test.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('6')
  })

  test('ac3 audio is transcoded to aac for browser compatibility', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const ids = await seedAndGetTrackIds(media.id, [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'ac3',
        is_default: true,
        channels: 6,
        channel_layout: '5.1',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: ids.video.id,
      audio: ids.audio.id,
    })
    const transcode = await Transcoder.init(resolved, config.transcoding)

    const args = transcode(new FFmpegBuilder().input('/test.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('6')
  })

  test('eac3 audio is transcoded to aac for browser compatibility', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const ids = await seedAndGetTrackIds(media.id, [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 1920,
        height: 1080,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'eac3',
        is_default: true,
        channels: 6,
        channel_layout: '5.1',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({
      video: ids.video.id,
      audio: ids.audio.id,
    })
    const transcode = await Transcoder.init(resolved, config.transcoding)

    const args = transcode(new FFmpegBuilder().input('/test.mkv')).toArgs()

    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-ac')).toBe('6')
  })

  test('incompatible subtitle codec still produces error', async () => {
    const media = await TestSeed.library.matrix({ rootFolder: '/movies' })

    const ids = await seedAndGetTrackIds(
      media.id,
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          width: 1920,
          height: 1080,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
        },
        {
          stream_index: 2,
          stream_type: 'subtitle',
          codec_name: 'dvd_subtitle',
          is_default: false,
        },
      ],
      { keyframes: [0], duration: 1 }
    )

    const player = new Player({ id: media.id })

     expect(() =>
      player.start({
        video: ids.video.id,
        audio: ids.audio.id,
        sub: ids.subtitle!.id,
      })
    ).toThrow(/dvd_subtitle.*only subrip/i)
  })
})
