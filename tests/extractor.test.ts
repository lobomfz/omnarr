import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterAll,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { database } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { Extractor } from '@/extractor'
import { Scanner } from '@/scanner'
import { deriveId } from '@/utils'

import { MediaFixtures } from './fixtures/media'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-extract-'))
const refMkv = join(tmpDir, 'ref-subs.mkv')
const refBasicMkv = join(tmpDir, 'ref-basic.mkv')
const refAssMkv = join(tmpDir, 'ref-ass.mkv')

describe('new Extractor().extract', () => {
  beforeAll(async () => {
    await MediaFixtures.generateWithSubs(refMkv, tmpDir)
    await MediaFixtures.generate(refBasicMkv)
    await MediaFixtures.generateWithAssSubs(refAssMkv, tmpDir)

    await MediaFixtures.copy(
      refMkv,
      join(tmpDir, 'media/The Matrix (1999)/movie.mkv')
    )
    await MediaFixtures.copy(
      refBasicMkv,
      join(tmpDir, 'media-noyear/Some Show/movie.mkv')
    )
    await MediaFixtures.copy(
      refAssMkv,
      join(tmpDir, 'media-ass/ASS Test (2020)/movie.mkv')
    )
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true })
  })

  beforeEach(async () => {
    await rm('/tmp/omnarr-test-tracks', { recursive: true, force: true })
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('media')
    database.reset('tmdb_media')
  })

  async function seedAndScan(input?: {
    tmdb_id: number
    title: string
    year?: number
    root_folder: string
  }) {
    const { tmdb_id, title, year, root_folder } = input ?? {
      tmdb_id: 603,
      title: 'The Matrix',
      year: 1999,
      root_folder: join(tmpDir, 'media'),
    }

    const tmdb = await DbTmdbMedia.upsert({
      tmdb_id,
      media_type: 'movie',
      title,
      year,
    })

    const media = await DbMedia.create({
      id: deriveId(`${tmdb_id}:movie`),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder,
    })

    await new Scanner().scan(media.id)

    return media
  }

  test('updates path and size for all unextracted tracks', async () => {
    const media = await seedAndScan()

    await new Extractor().extract(media.id)

    const tracks = await DbMediaTracks.getByMediaId(media.id)

    for (const track of tracks) {
      expect(track.path).not.toBeNull()
      expect(track.size).toBeGreaterThan(0)
    }
  })

  test('extracted files exist on disk', async () => {
    const media = await seedAndScan()

    await new Extractor().extract(media.id)

    const tracks = await DbMediaTracks.getByMediaId(media.id)

    for (const track of tracks) {
      expect(Bun.file(track.path!).size).toBeGreaterThan(0)
    }
  })

  test('output paths follow naming convention', async () => {
    const media = await seedAndScan()

    await new Extractor().extract(media.id)

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
    const sizeBefore = Bun.file(sourcePath).size

    await new Extractor().extract(media.id)

    expect(Bun.file(sourcePath).size).toBe(sizeBefore)
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

    const { failed } = await new Extractor().extract(media.id)

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

    await new Extractor().extract(media.id)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const failedTrack = tracks.find((t) => t.id === fakeTrack.id)!

    expect(failedTrack.path).toBeNull()
    expect(failedTrack.size).toBeNull()
  })

  test('re-executing extract skips already extracted tracks', async () => {
    const media = await seedAndScan()

    await new Extractor().extract(media.id)

    const { failed } = await new Extractor().extract(media.id)

    expect(failed).toHaveLength(0)

    const tracks = await DbMediaTracks.getByMediaId(media.id)

    for (const track of tracks) {
      expect(track.path).not.toBeNull()
    }
  })

  test('omits year from output path when null', async () => {
    const media = await seedAndScan({
      tmdb_id: 999,
      title: 'Some Show',
      root_folder: join(tmpDir, 'media-noyear'),
    })

    await new Extractor().extract(media.id)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const video = tracks.find((t) => t.stream_type === 'video')!

    expect(video.path).toContain('/movie/Some Show/video/')
    expect(video.path).not.toContain('(')
  })

  test('omits language from filename when null', async () => {
    const media = await seedAndScan({
      tmdb_id: 999,
      title: 'Some Show',
      root_folder: join(tmpDir, 'media-noyear'),
    })

    await new Extractor().extract(media.id)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const video = tracks.find((t) => t.stream_type === 'video')!
    const filename = video.path!.split('/').at(-1)!

    expect(video.language).toBeNull()
    expect(filename).toMatch(/^\d+-h264-\d+x\d+\.mkv$/)
  })

  test('uses .ass extension for ass subtitle codec', async () => {
    const tmdb = await DbTmdbMedia.upsert({
      tmdb_id: 888,
      media_type: 'movie',
      title: 'ASS Test',
      year: 2020,
    })

    const media = await DbMedia.create({
      id: deriveId('888:movie'),
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: join(tmpDir, 'media-ass'),
    })

    await new Scanner().scan(media.id)
    await new Extractor().extract(media.id)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const sub = tracks.find((t) => t.stream_type === 'subtitle')!

    expect(sub.codec_name).toBe('ass')
    expect(sub.path!).toMatch(/\.ass$/)
  })
})
