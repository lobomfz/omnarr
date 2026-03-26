import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterAll,
} from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { Scanner } from '@/scanner'
import { deriveId } from '@/utils'

import { MediaFixtures } from './fixtures/media'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-test-'))
const refMkv = join(tmpDir, 'ref.mkv')
const refSubsMkv = join(tmpDir, 'ref-subs.mkv')

beforeAll(async () => {
  await MediaFixtures.generate(refMkv)
  await MediaFixtures.generateWithSubs(refSubsMkv, tmpDir)

  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'basic/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'recursive/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'recursive/The Matrix (1999)/extras/bonus.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'extensions/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'extensions/The Matrix (1999)/movie.mp4')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'extensions/The Matrix (1999)/movie.avi')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'extensions/The Matrix (1999)/movie.ts')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'ignore/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.writeDummy(
    join(tmpDir, 'ignore/The Matrix (1999)/info.nfo')
  )
  await MediaFixtures.writeDummy(
    join(tmpDir, 'ignore/The Matrix (1999)/poster.jpg')
  )
  await MediaFixtures.writeDummy(
    join(tmpDir, 'ignore/The Matrix (1999)/notes.txt')
  )
  await MediaFixtures.writeDummy(
    join(tmpDir, 'ignore/The Matrix (1999)/subs.srt')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'persist/The Matrix (1999)/movie.mkv')
  )
  await mkdir(join(tmpDir, 'empty/The Matrix (1999)'), { recursive: true })
  await MediaFixtures.writeDummy(
    join(tmpDir, 'empty/The Matrix (1999)/info.nfo')
  )
  await MediaFixtures.copy(
    refSubsMkv,
    join(tmpDir, 'probe/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'recon-new/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'recon-del/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'recon-del/The Matrix (1999)/bonus.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'recon-cascade/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'recon-cascade/The Matrix (1999)/bonus.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'recon-keep/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.copy(
    refSubsMkv,
    join(tmpDir, 'recon-tracks/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.copy(
    refSubsMkv,
    join(tmpDir, 'force/The Matrix (1999)/movie.mkv')
  )
  await MediaFixtures.copy(refMkv, join(tmpDir, 'single-file/movie.mkv'))
  await MediaFixtures.copy(refMkv, join(tmpDir, 'multi/dl1/movie.mkv'))
  await MediaFixtures.copy(refMkv, join(tmpDir, 'multi/dl2/bonus.mkv'))
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

beforeEach(() => {
  database.reset()
})

async function seedMedia(contentPath: string) {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    year: 1999,
  })

  const media = await DbMedia.create({
    id: deriveId('603:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/movies',
  })

  await DbDownloads.create({
    media_id: media.id,
    info_hash: 'test_hash',
    download_url: 'magnet:test',
    status: 'completed',
    content_path: contentPath,
  })

  return media
}

describe('new Scanner().scan — file discovery', () => {
  test('finds media files in content_path directory', async () => {
    const media = await seedMedia(join(tmpDir, 'basic/The Matrix (1999)'))
    const files = await new Scanner().scan(media.id)

    expect(files).toHaveLength(1)
    expect(files[0].path).toBe(
      join(tmpDir, 'basic/The Matrix (1999)/movie.mkv')
    )
    expect(files[0].size).toBeGreaterThan(0)
  })

  test('finds files recursively in subfolders', async () => {
    const media = await seedMedia(join(tmpDir, 'recursive/The Matrix (1999)'))
    const files = await new Scanner().scan(media.id)

    expect(files).toHaveLength(2)
  })

  test('only considers valid extensions (.mkv, .mp4, .avi, .ts)', async () => {
    const media = await seedMedia(join(tmpDir, 'extensions/The Matrix (1999)'))
    const files = await new Scanner().scan(media.id)

    expect(files).toHaveLength(4)
  })

  test('ignores files with irrelevant extensions', async () => {
    const media = await seedMedia(join(tmpDir, 'ignore/The Matrix (1999)'))
    const files = await new Scanner().scan(media.id)

    expect(files).toHaveLength(1)
    expect(files[0].path).toContain('movie.mkv')
  })

  test('persists each file in media_files with path and size', async () => {
    const media = await seedMedia(join(tmpDir, 'persist/The Matrix (1999)'))
    await new Scanner().scan(media.id)

    const persisted = await DbMediaFiles.getByMediaId(media.id)

    expect(persisted).toHaveLength(1)
    expect(persisted[0].path).toBe(
      join(tmpDir, 'persist/The Matrix (1999)/movie.mkv')
    )
    expect(persisted[0].size).toBeGreaterThan(0)
    expect(persisted[0].media_id).toBe(media.id)
  })

  test('returns empty array when no valid files found', async () => {
    const media = await seedMedia(join(tmpDir, 'empty/The Matrix (1999)'))
    const files = await new Scanner().scan(media.id)

    expect(files).toHaveLength(0)
  })

  test('throws when media_id does not exist', async () => {
    await expect(() => new Scanner().scan('NONEXISTENT')).toThrow()
  })

  test('probes single file when content_path is a file', async () => {
    const media = await seedMedia(join(tmpDir, 'single-file/movie.mkv'))
    const files = await new Scanner().scan(media.id)

    expect(files).toHaveLength(1)
    expect(files[0].path).toBe(join(tmpDir, 'single-file/movie.mkv'))
  })

  test('discovers files from multiple content_paths', async () => {
    const media = await seedMedia(join(tmpDir, 'multi/dl1'))

    await DbDownloads.create({
      media_id: media.id,
      info_hash: 'second_hash',
      download_url: 'magnet:test2',
      status: 'completed',
      content_path: join(tmpDir, 'multi/dl2'),
    })

    const files = await new Scanner().scan(media.id)

    expect(files).toHaveLength(2)
  })
})

describe('new Scanner().scan — probe + tracks', () => {
  test('fills format_name and duration on media_file', async () => {
    const media = await seedMedia(join(tmpDir, 'basic/The Matrix (1999)'))
    await new Scanner().scan(media.id)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files[0].format_name).toBeTruthy()
    expect(files[0].duration).toBeGreaterThan(0)
  })

  test('creates tracks for each stream in the file', async () => {
    const media = await seedMedia(join(tmpDir, 'probe/The Matrix (1999)'))
    await new Scanner().scan(media.id)

    const files = await DbMediaFiles.getByMediaId(media.id)
    const tracks = await DbMediaTracks.getByMediaFileId(files[0].id)

    expect(tracks.length).toBeGreaterThanOrEqual(3)

    const types = tracks.map((t) => t.stream_type)

    expect(types).toContain('video')
    expect(types).toContain('audio')
    expect(types).toContain('subtitle')
  })

  test('video track has type-specific fields', async () => {
    const media = await seedMedia(join(tmpDir, 'probe/The Matrix (1999)'))
    await new Scanner().scan(media.id)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const video = tracks.find((t) => t.stream_type === 'video')!

    expect(video.codec_name).toBe('h264')
    expect(video.width).toBe(320)
    expect(video.height).toBe(240)
    expect(video.framerate).toBeGreaterThan(0)
    expect(video.is_default).toBe(true)
  })

  test('audio track has type-specific fields', async () => {
    const media = await seedMedia(join(tmpDir, 'probe/The Matrix (1999)'))
    await new Scanner().scan(media.id)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const audio = tracks.find((t) => t.stream_type === 'audio')!

    expect(audio.codec_name).toBe('aac')
    expect(audio.channels).toBeGreaterThan(0)
    expect(audio.channel_layout).toBeTruthy()
    expect(audio.sample_rate).toBe(48000)
    expect(audio.language).toBe('eng')
    expect(audio.title).toBe('English Stereo')
  })

  test('subtitle track has codec and language', async () => {
    const media = await seedMedia(join(tmpDir, 'probe/The Matrix (1999)'))
    await new Scanner().scan(media.id)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const sub = tracks.find((t) => t.stream_type === 'subtitle')!

    expect(sub.codec_name).toBe('subrip')
    expect(sub.language).toBe('por')
  })
})

describe('new Scanner().scan — reconciliation', () => {
  test('inserts new file on disk after re-scan with probe data', async () => {
    const contentPath = join(tmpDir, 'recon-new/The Matrix (1999)')
    const media = await seedMedia(contentPath)

    await new Scanner().scan(media.id)

    await MediaFixtures.copy(refMkv, join(contentPath, 'bonus.mkv'))

    await new Scanner().scan(media.id)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files).toHaveLength(2)

    const bonus = files.find((f) => f.path.includes('bonus.mkv'))!

    expect(bonus.format_name).toBeTruthy()
    expect(bonus.duration).toBeGreaterThan(0)

    const tracks = await DbMediaTracks.getByMediaFileId(bonus.id)

    expect(tracks.length).toBeGreaterThan(0)
  })

  test('deletes file missing from disk after re-scan', async () => {
    const contentPath = join(tmpDir, 'recon-del/The Matrix (1999)')
    const media = await seedMedia(contentPath)

    await new Scanner().scan(media.id)

    await rm(join(contentPath, 'bonus.mkv'))

    await new Scanner().scan(media.id)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files).toHaveLength(1)
    expect(files[0].path).toContain('movie.mkv')
  })

  test('cascade deletes tracks of removed file', async () => {
    const contentPath = join(tmpDir, 'recon-cascade/The Matrix (1999)')
    const media = await seedMedia(contentPath)

    await new Scanner().scan(media.id)

    const filesBefore = await DbMediaFiles.getByMediaId(media.id)
    const bonus = filesBefore.find((f) => f.path.includes('bonus.mkv'))!
    const tracksBefore = await DbMediaTracks.getByMediaFileId(bonus.id)

    expect(tracksBefore.length).toBeGreaterThan(0)

    await rm(join(contentPath, 'bonus.mkv'))

    await new Scanner().scan(media.id)

    const tracksAfter = await DbMediaTracks.getByMediaFileId(bonus.id)

    expect(tracksAfter).toHaveLength(0)
  })

  test('keeps existing file intact on re-scan', async () => {
    const media = await seedMedia(join(tmpDir, 'recon-keep/The Matrix (1999)'))

    await new Scanner().scan(media.id)

    const filesBefore = await DbMediaFiles.getByMediaId(media.id)

    await new Scanner().scan(media.id)

    const filesAfter = await DbMediaFiles.getByMediaId(media.id)

    expect(filesAfter).toHaveLength(1)
    expect(filesAfter[0].id).toBe(filesBefore[0].id)
    expect(filesAfter[0].path).toBe(filesBefore[0].path)
  })

  test('force re-scan deletes all files and re-probes from scratch', async () => {
    const media = await seedMedia(join(tmpDir, 'force/The Matrix (1999)'))

    await new Scanner().scan(media.id)

    const filesBefore = await DbMediaFiles.getByMediaId(media.id)

    await new Scanner().scan(media.id, { force: true })

    const filesAfter = await DbMediaFiles.getByMediaId(media.id)

    expect(filesAfter).toHaveLength(1)
    expect(filesAfter[0].id).not.toBe(filesBefore[0].id)
  })
})
