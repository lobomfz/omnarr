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
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { Scanner } from '@/scanner'
import { deriveId } from '@/utils'

const noop = () => {}

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
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'tv-basic/Breaking.Bad.S01E01.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'tv-basic/Breaking.Bad.S01E02.mkv')
  )
  await MediaFixtures.copy(refMkv, join(tmpDir, 'tv-orphan/random-file.mkv'))
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'tv-nonexistent/Breaking.Bad.S01E99.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'tv-multi-ep/Breaking.Bad.S01E01E02.mkv')
  )
  await MediaFixtures.copy(
    refMkv,
    join(tmpDir, 'tv-force/Breaking.Bad.S01E01.mkv')
  )
  await MediaFixtures.writeDummy(join(tmpDir, 'sub-discover/sub_en.srt'))
  await MediaFixtures.copy(refMkv, join(tmpDir, 'mixed-srt/movie.mkv'))
  await MediaFixtures.writeDummy(join(tmpDir, 'mixed-srt/sub_en.srt'))
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
    imdb_id: 'tt0133093',
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
    source_id: 'test_hash',
    download_url: 'magnet:test',
    status: 'completed',
    content_path: contentPath,
  })

  return media
}

async function seedTvMedia(contentPath: string) {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 1396,
    media_type: 'tv',
    title: 'Breaking Bad',
    imdb_id: 'tt0903747',
    year: 2008,
  })

  const media = await DbMedia.create({
    id: deriveId('1396:tv'),
    tmdb_media_id: tmdb.id,
    media_type: 'tv',
    root_folder: '/tv',
  })

  const seasons = await DbSeasons.upsert([
    {
      tmdb_media_id: tmdb.id,
      season_number: 1,
      title: 'Season 1',
      episode_count: 7,
    },
  ])

  await DbEpisodes.upsert([
    { season_id: seasons[0].id, episode_number: 1, title: 'Pilot' },
    {
      season_id: seasons[0].id,
      episode_number: 2,
      title: "Cat's in the Bag...",
    },
    {
      season_id: seasons[0].id,
      episode_number: 3,
      title: "...And the Bag's in the River",
    },
  ])

  await DbDownloads.create({
    media_id: media.id,
    source_id: 'tv_test_hash',
    download_url: 'magnet:test',
    status: 'completed',
    content_path: contentPath,
  })

  return media
}

describe('new Scanner().scan — file discovery', () => {
  test('finds media files in content_path directory', async () => {
    const media = await seedMedia(join(tmpDir, 'basic/The Matrix (1999)'))
    const files = await new Scanner().scan(media.id, noop)

    expect(files).toHaveLength(1)
    expect(files[0].path).toBe(
      join(tmpDir, 'basic/The Matrix (1999)/movie.mkv')
    )
    expect(files[0].size).toBeGreaterThan(0)
  })

  test('finds files recursively in subfolders', async () => {
    const media = await seedMedia(join(tmpDir, 'recursive/The Matrix (1999)'))
    const files = await new Scanner().scan(media.id, noop)

    expect(files).toHaveLength(2)
  })

  test('only considers valid extensions (.mkv, .mp4, .avi, .ts)', async () => {
    const media = await seedMedia(join(tmpDir, 'extensions/The Matrix (1999)'))
    const files = await new Scanner().scan(media.id, noop)

    expect(files).toHaveLength(4)
  })

  test('ignores non-media files (.nfo, .jpg, .txt)', async () => {
    const media = await seedMedia(join(tmpDir, 'ignore/The Matrix (1999)'))
    const files = await new Scanner().scan(media.id, noop)

    expect(files).toHaveLength(2)

    const paths = files.map((f) => f.path)

    expect(paths.some((p) => p.includes('movie.mkv'))).toBe(true)
    expect(paths.some((p) => p.includes('subs.srt'))).toBe(true)
  })

  test('persists each file in media_files with path and size', async () => {
    const media = await seedMedia(join(tmpDir, 'persist/The Matrix (1999)'))
    await new Scanner().scan(media.id, noop)

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
    const files = await new Scanner().scan(media.id, noop)

    expect(files).toHaveLength(0)
  })

  test('throws when media_id does not exist', async () => {
    await expect(() => new Scanner().scan('NONEXISTENT', noop)).toThrow()
  })

  test('probes single file when content_path is a file', async () => {
    const media = await seedMedia(join(tmpDir, 'single-file/movie.mkv'))
    const files = await new Scanner().scan(media.id, noop)

    expect(files).toHaveLength(1)
    expect(files[0].path).toBe(join(tmpDir, 'single-file/movie.mkv'))
  })

  test('discovers files from multiple content_paths', async () => {
    const media = await seedMedia(join(tmpDir, 'multi/dl1'))

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'second_hash',
      download_url: 'magnet:test2',
      status: 'completed',
      content_path: join(tmpDir, 'multi/dl2'),
    })

    const files = await new Scanner().scan(media.id, noop)

    expect(files).toHaveLength(2)
  })
})

describe('new Scanner().scan — probe + tracks', () => {
  test('fills format_name and duration on media_file', async () => {
    const media = await seedMedia(join(tmpDir, 'basic/The Matrix (1999)'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files[0].format_name).toBeTruthy()
    expect(files[0].duration).toBeGreaterThan(0)
  })

  test('creates tracks for each stream in the file', async () => {
    const media = await seedMedia(join(tmpDir, 'probe/The Matrix (1999)'))
    await new Scanner().scan(media.id, noop)

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
    await new Scanner().scan(media.id, noop)

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
    await new Scanner().scan(media.id, noop)

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
    await new Scanner().scan(media.id, noop)

    const tracks = await DbMediaTracks.getByMediaId(media.id)
    const sub = tracks.find((t) => t.stream_type === 'subtitle')!

    expect(sub.codec_name).toBe('subrip')
    expect(sub.language).toBe('por')
  })
})

describe('new Scanner().scan — keyframe probing', () => {
  test('persists keyframes for video stream after scan', async () => {
    const media = await seedMedia(join(tmpDir, 'basic/The Matrix (1999)'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)
    const keyframes = await DbMediaKeyframes.getSegmentsByFileId(files[0].id)

    expect(keyframes.length).toBeGreaterThan(0)
    expect(keyframes[0].pts_time).toBeGreaterThanOrEqual(0)
    expect(keyframes[0].duration).toBeGreaterThan(0)
  })

  test('keyframes have valid pts_time positions', async () => {
    const media = await seedMedia(join(tmpDir, 'basic/The Matrix (1999)'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)
    const keyframes = await DbMediaKeyframes.getSegmentsByFileId(files[0].id)

    expect(keyframes.length).toBeGreaterThan(0)
    expect(keyframes[0].pts_time).toBeCloseTo(0.0, 1)

    for (const kf of keyframes) {
      expect(kf.pts_time).toBeGreaterThanOrEqual(0)
    }
  })

  test('re-scan does not duplicate keyframes', async () => {
    const media = await seedMedia(join(tmpDir, 'recon-keep/The Matrix (1999)'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)
    const first = await DbMediaKeyframes.getSegmentsByFileId(files[0].id)

    expect(first.length).toBeGreaterThan(0)

    await new Scanner().scan(media.id, noop)

    const second = await DbMediaKeyframes.getSegmentsByFileId(files[0].id)

    expect(second).toHaveLength(first.length)
  })
})

describe('new Scanner().scan — reconciliation', () => {
  test('inserts new file on disk after re-scan with probe data', async () => {
    const contentPath = join(tmpDir, 'recon-new/The Matrix (1999)')
    const media = await seedMedia(contentPath)

    await new Scanner().scan(media.id, noop)

    await MediaFixtures.copy(refMkv, join(contentPath, 'bonus.mkv'))

    await new Scanner().scan(media.id, noop)

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

    await new Scanner().scan(media.id, noop)

    await rm(join(contentPath, 'bonus.mkv'))

    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files).toHaveLength(1)
    expect(files[0].path).toContain('movie.mkv')
  })

  test('cascade deletes tracks of removed file', async () => {
    const contentPath = join(tmpDir, 'recon-cascade/The Matrix (1999)')
    const media = await seedMedia(contentPath)

    await new Scanner().scan(media.id, noop)

    const filesBefore = await DbMediaFiles.getByMediaId(media.id)
    const bonus = filesBefore.find((f) => f.path.includes('bonus.mkv'))!
    const tracksBefore = await DbMediaTracks.getByMediaFileId(bonus.id)

    expect(tracksBefore.length).toBeGreaterThan(0)

    await rm(join(contentPath, 'bonus.mkv'))

    await new Scanner().scan(media.id, noop)

    const tracksAfter = await DbMediaTracks.getByMediaFileId(bonus.id)

    expect(tracksAfter).toHaveLength(0)
  })

  test('keeps existing file intact on re-scan', async () => {
    const media = await seedMedia(join(tmpDir, 'recon-keep/The Matrix (1999)'))

    await new Scanner().scan(media.id, noop)

    const filesBefore = await DbMediaFiles.getByMediaId(media.id)

    await new Scanner().scan(media.id, noop)

    const filesAfter = await DbMediaFiles.getByMediaId(media.id)

    expect(filesAfter).toHaveLength(1)
    expect(filesAfter[0].id).toBe(filesBefore[0].id)
    expect(filesAfter[0].path).toBe(filesBefore[0].path)
  })

  test('force re-scan deletes all files and re-probes from scratch', async () => {
    const media = await seedMedia(join(tmpDir, 'force/The Matrix (1999)'))

    await new Scanner().scan(media.id, noop)

    const filesBefore = await DbMediaFiles.getByMediaId(media.id)

    await new Scanner().scan(media.id, noop, { force: true })

    const filesAfter = await DbMediaFiles.getByMediaId(media.id)

    expect(filesAfter).toHaveLength(1)
    expect(filesAfter[0].id).not.toBe(filesBefore[0].id)
  })
})

describe('new Scanner().scan — TV episode association', () => {
  test('sets episode_id on files matching S/E pattern for TV media', async () => {
    const media = await seedTvMedia(join(tmpDir, 'tv-basic'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files).toHaveLength(2)

    const ep1 = files.find((f) => f.path.includes('S01E01'))!
    const ep2 = files.find((f) => f.path.includes('S01E02'))!

    expect(ep1.episode_id).not.toBeNull()
    expect(ep2.episode_id).not.toBeNull()
    expect(ep1.episode_id).not.toBe(ep2.episode_id)
  })

  test('leaves episode_id null for files without S/E pattern', async () => {
    const media = await seedTvMedia(join(tmpDir, 'tv-orphan'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files).toHaveLength(1)
    expect(files[0].episode_id).toBeNull()
  })

  test('leaves episode_id null for nonexistent episode numbers', async () => {
    const media = await seedTvMedia(join(tmpDir, 'tv-nonexistent'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files).toHaveLength(1)
    expect(files[0].episode_id).toBeNull()
  })

  test('associates multi-episode files with first episode', async () => {
    const media = await seedTvMedia(join(tmpDir, 'tv-multi-ep'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files).toHaveLength(1)
    expect(files[0].episode_id).not.toBeNull()

    const ep1 = await DbEpisodes.getBySeasonEpisode(media.tmdb_media_id, 1, 1)

    expect(files[0].episode_id).toBe(ep1!.id)
  })

  test('force re-scan re-associates files to episodes', async () => {
    const media = await seedTvMedia(join(tmpDir, 'tv-force'))
    await new Scanner().scan(media.id, noop)

    const filesBefore = await DbMediaFiles.getByMediaId(media.id)

    expect(filesBefore[0].episode_id).not.toBeNull()

    await new Scanner().scan(media.id, noop, { force: true })

    const filesAfter = await DbMediaFiles.getByMediaId(media.id)

    expect(filesAfter[0].episode_id).not.toBeNull()
    expect(filesAfter[0].id).not.toBe(filesBefore[0].id)
  })

  test('does not set episode_id for movie media', async () => {
    const media = await seedMedia(join(tmpDir, 'basic/The Matrix (1999)'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files[0].episode_id).toBeNull()
  })
})

describe('new Scanner().scan — progress callback', () => {
  test('calls onProgress for each new file', async () => {
    const media = await seedMedia(join(tmpDir, 'recursive/The Matrix (1999)'))
    const seen = new Set<number>()

    await new Scanner().scan(media.id, (current, total) => {
      seen.add(current)
      expect(total).toBe(2)
    })

    expect(seen.has(1)).toBe(true)
    expect(seen.has(2)).toBe(true)
  })

  test('reports sub-file progress ratio during probe', async () => {
    const media = await seedMedia(join(tmpDir, 'basic/The Matrix (1999)'))
    const ratios: number[] = []

    await new Scanner().scan(media.id, (_current, _total, _path, ratio) => {
      ratios.push(ratio)
    })

    expect(ratios.length).toBeGreaterThan(1)
    expect(ratios[0]).toBe(0)
    expect(ratios.at(-1)).toBe(1)

    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1])
    }
  })

  test('does not call onProgress when no new files', async () => {
    const media = await seedMedia(join(tmpDir, 'recon-keep/The Matrix (1999)'))
    await new Scanner().scan(media.id, noop)

    const progress: { current: number; total: number }[] = []

    await new Scanner().scan(media.id, (current, total) => {
      progress.push({ current, total })
    })

    expect(progress).toHaveLength(0)
  })
})

describe('new Scanner().scan — external subtitle files', () => {
  test('discovers .srt files in content paths', async () => {
    const media = await seedMedia(join(tmpDir, 'sub-discover'))
    const files = await new Scanner().scan(media.id, noop)

    expect(files).toHaveLength(1)
    expect(files[0].path).toContain('sub_en.srt')
  })

  test('creates media_files without format_name or duration', async () => {
    const media = await seedMedia(join(tmpDir, 'sub-discover'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)

    expect(files).toHaveLength(1)
    expect(files[0].size).toBeGreaterThan(0)
    expect(files[0].format_name).toBeNull()
    expect(files[0].duration).toBeNull()
  })

  test('creates subtitle track with correct metadata and language', async () => {
    const media = await seedMedia(join(tmpDir, 'sub-discover'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)
    const tracks = await DbMediaTracks.getByMediaFileId(files[0].id)

    expect(tracks).toHaveLength(1)
    expect(tracks[0].stream_type).toBe('subtitle')
    expect(tracks[0].stream_index).toBe(0)
    expect(tracks[0].codec_name).toBe('subrip')
    expect(tracks[0].language).toBe('en')
    expect(tracks[0].is_default).toBe(false)
  })

  test('handles mixed video and subtitle files', async () => {
    const media = await seedMedia(join(tmpDir, 'mixed-srt'))
    const files = await new Scanner().scan(media.id, noop)

    expect(files).toHaveLength(2)

    const subFile = files.find((f) => f.path.includes('.srt'))
    const videoFile = files.find((f) => f.path.includes('.mkv'))

    expect(subFile).toBeDefined()
    expect(videoFile).toBeDefined()
    expect(videoFile!.duration).toBeGreaterThan(0)
    expect(subFile!.duration).toBeNull()
  })

  test('does not create keyframes or vad data for subtitle files', async () => {
    const media = await seedMedia(join(tmpDir, 'sub-discover'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)
    const keyframes = await DbMediaKeyframes.getSegmentsByFileId(files[0].id)
    const vad = await DbMediaVad.getByMediaFileId(files[0].id)

    expect(keyframes).toHaveLength(0)
    expect(vad).toBeUndefined()
  })
})

describe('new Scanner().scan — VAD extraction', () => {
  test('scanning a media file produces vad data in media_vad', async () => {
    const media = await seedMedia(join(tmpDir, 'basic/The Matrix (1999)'))
    await new Scanner().scan(media.id, noop)

    const files = await DbMediaFiles.getByMediaId(media.id)
    const vad = await DbMediaVad.getByMediaFileId(files[0].id)

    expect(vad).toBeDefined()
    expect(vad!.data).toBeInstanceOf(Uint8Array)
  })

  test('force-rescan recomputes vad data', async () => {
    const media = await seedMedia(join(tmpDir, 'force/The Matrix (1999)'))
    await new Scanner().scan(media.id, noop)

    const filesBefore = await DbMediaFiles.getByMediaId(media.id)
    const vadBefore = await DbMediaVad.getByMediaFileId(filesBefore[0].id)

    expect(vadBefore).toBeDefined()

    await new Scanner().scan(media.id, noop, { force: true })

    const filesAfter = await DbMediaFiles.getByMediaId(media.id)
    const vadAfter = await DbMediaVad.getByMediaFileId(filesAfter[0].id)

    expect(vadAfter).toBeDefined()
    expect(filesAfter[0].id).not.toBe(filesBefore[0].id)
  })
})
