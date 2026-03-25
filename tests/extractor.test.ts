import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterAll,
} from 'bun:test'
import { mkdtempSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { database } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { Extractor } from '@/extractor'
import { Scanner } from '@/scanner'

import { MediaFixtures } from './fixtures/media'

describe('new Extractor().extension', () => {
  test('video tracks resolve to .mkv regardless of codec', () => {
    expect(new Extractor().extension('video', 'h264')).toBe('.mkv')
    expect(new Extractor().extension('video', 'hevc')).toBe('.mkv')
  })

  test('audio tracks resolve to .mka regardless of codec', () => {
    expect(new Extractor().extension('audio', 'aac')).toBe('.mka')
    expect(new Extractor().extension('audio', 'ac3')).toBe('.mka')
  })

  test('subtitle subrip resolves to .srt', () => {
    expect(new Extractor().extension('subtitle', 'subrip')).toBe('.srt')
  })

  test('subtitle ass resolves to .ass', () => {
    expect(new Extractor().extension('subtitle', 'ass')).toBe('.ass')
  })

  test('subtitle hdmv_pgs_subtitle resolves to .sup', () => {
    expect(new Extractor().extension('subtitle', 'hdmv_pgs_subtitle')).toBe(
      '.sup'
    )
  })

  test('unknown subtitle codec falls back to .mks', () => {
    expect(new Extractor().extension('subtitle', 'unknown_codec')).toBe('.mks')
  })
})

describe('new Extractor().filename', () => {
  test('video: index-codec-language-resolution.mkv', () => {
    const name = new Extractor().filename({
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      language: 'eng',
      width: 1920,
      height: 1080,
      channel_layout: null,
    })

    expect(name).toBe('0-h264-eng-1920x1080.mkv')
  })

  test('audio: index-codec-language-channel_layout.mka', () => {
    const name = new Extractor().filename({
      stream_index: 1,
      stream_type: 'audio',
      codec_name: 'aac',
      language: 'eng',
      width: null,
      height: null,
      channel_layout: 'stereo',
    })

    expect(name).toBe('1-aac-eng-stereo.mka')
  })

  test('omits language when null', () => {
    const name = new Extractor().filename({
      stream_index: 0,
      stream_type: 'video',
      codec_name: 'h264',
      language: null,
      width: 1920,
      height: 1080,
      channel_layout: null,
    })

    expect(name).toBe('0-h264-1920x1080.mkv')
  })

  test('subtitle: no qualifier, codec-specific extension', () => {
    const name = new Extractor().filename({
      stream_index: 2,
      stream_type: 'subtitle',
      codec_name: 'subrip',
      language: 'por',
      width: null,
      height: null,
      channel_layout: null,
    })

    expect(name).toBe('2-subrip-por.srt')
  })
})

describe('new Extractor().outputPath', () => {
  test('builds tracks_root_folder/media_type/Title (Year)/stream_type/filename', () => {
    const path = new Extractor().outputPath(
      '/tracks',
      'movie',
      'The Matrix',
      1999,
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        language: 'eng',
        width: 1920,
        height: 1080,
        channel_layout: null,
      }
    )

    expect(path).toBe(
      '/tracks/movie/The Matrix (1999)/video/0-h264-eng-1920x1080.mkv'
    )
  })

  test('omits year from path when null', () => {
    const path = new Extractor().outputPath(
      '/tracks',
      'tv',
      'Some Show',
      null,
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        language: 'jpn',
        width: null,
        height: null,
        channel_layout: '5.1',
      }
    )

    expect(path).toBe('/tracks/tv/Some Show/audio/1-aac-jpn-5.1.mka')
  })
})

const tmpDir = mkdtempSync(join(tmpdir(), 'omnarr-extract-'))
const tracksDir = join(tmpDir, 'tracks')
const refMkv = join(tmpDir, 'ref-subs.mkv')

describe('new Extractor().extract', () => {
  beforeAll(async () => {
    await MediaFixtures.generateWithSubs(refMkv, tmpDir)
    MediaFixtures.copy(
      refMkv,
      join(tmpDir, 'media/The Matrix (1999)/movie.mkv')
    )
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true })
  })

  beforeEach(() => {
    rmSync(tracksDir, { recursive: true, force: true })
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('media')
    database.reset('tmdb_media')
  })

  async function seedAndScan() {
    const tmdb = await DbTmdbMedia.upsert({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      year: 1999,
    })

    const media = await DbMedia.create({
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: join(tmpDir, 'media'),
    })

    await new Scanner().scan(media.id)

    return media
  }

  test('updates path and size for all unextracted tracks', async () => {
    const media = await seedAndScan()

    await new Extractor().extract(media.id, tracksDir)

    const tracks = await DbMediaTracks.getByMediaId(media.id)

    for (const track of tracks) {
      expect(track.path).not.toBeNull()
      expect(track.size).toBeGreaterThan(0)
    }
  })

  test('extracted files exist on disk', async () => {
    const media = await seedAndScan()

    await new Extractor().extract(media.id, tracksDir)

    const tracks = await DbMediaTracks.getByMediaId(media.id)

    for (const track of tracks) {
      expect(statSync(track.path!).size).toBeGreaterThan(0)
    }
  })

  test('output paths follow naming convention', async () => {
    const media = await seedAndScan()

    await new Extractor().extract(media.id, tracksDir)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const video = tracks.find((t) => t.stream_type === 'video')!
    const audio = tracks.find((t) => t.stream_type === 'audio')!
    const sub = tracks.find((t) => t.stream_type === 'subtitle')!

    expect(video.path).toContain('/movie/The Matrix (1999)/video/')
    expect(video.path!).toMatch(/\.mkv$/)
    expect(audio.path).toContain('/movie/The Matrix (1999)/audio/')
    expect(audio.path!).toMatch(/\.mka$/)
    expect(sub.path).toContain('/movie/The Matrix (1999)/subtitle/')
    expect(sub.path!).toMatch(/\.srt$/)
  })

  test('preserves original container', async () => {
    const media = await seedAndScan()
    const sourcePath = join(tmpDir, 'media/The Matrix (1999)/movie.mkv')
    const sizeBefore = statSync(sourcePath).size

    await new Extractor().extract(media.id, tracksDir)

    expect(statSync(sourcePath).size).toBe(sizeBefore)
  })

  test('continues extracting after a track fails', async () => {
    const media = await seedAndScan()

    const fakeFile = await DbMediaFiles.create({
      media_id: media.id,
      path: '/nonexistent/fake.mkv',
      size: 0,
    })

    await DbMediaTracks.create({
      media_file_id: fakeFile.id,
      stream_index: 99,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: false,
    })

    const { failed } = await new Extractor().extract(media.id, tracksDir)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const extracted = tracks.filter((t) => t.path !== null)

    expect(extracted.length).toBeGreaterThanOrEqual(3)
    expect(failed).toHaveLength(1)
  })

  test('failed tracks remain with path null', async () => {
    const media = await seedAndScan()

    const fakeFile = await DbMediaFiles.create({
      media_id: media.id,
      path: '/nonexistent/fake.mkv',
      size: 0,
    })

    const fakeTrack = await DbMediaTracks.create({
      media_file_id: fakeFile.id,
      stream_index: 99,
      stream_type: 'video',
      codec_name: 'h264',
      is_default: false,
    })

    await new Extractor().extract(media.id, tracksDir)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const failedTrack = tracks.find((t) => t.id === fakeTrack.id)!

    expect(failedTrack.path).toBeNull()
    expect(failedTrack.size).toBeNull()
  })

  test('re-executing extract skips already extracted tracks', async () => {
    const media = await seedAndScan()

    await new Extractor().extract(media.id, tracksDir)

    const { failed } = await new Extractor().extract(media.id, tracksDir)

    expect(failed).toHaveLength(0)

    const tracks = await DbMediaTracks.getByMediaId(media.id)

    for (const track of tracks) {
      expect(track.path).not.toBeNull()
    }
  })
})
