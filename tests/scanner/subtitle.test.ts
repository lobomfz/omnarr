import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { Scanner } from '@/core/scanner'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'

import { TestSeed } from '../helpers/seed'

const testDir = join(tmpdir(), 'omnarr-scanner-subtitle-test')
beforeEach(async () => {
  TestSeed.reset()
  await rm(testDir, { recursive: true }).catch(() => {})
  await mkdir(testDir, { recursive: true })
})

afterAll(async () => {
  await rm(testDir, { recursive: true }).catch(() => {})
})

let seedCounter = 0

async function seedMovie() {
  seedCounter++
  const media = await TestSeed.library.movie({
    tmdbId: 100 + seedCounter,
    title: 'Test Media',
    year: 2024,
    imdbId: 'tt0000001',
  })

  return media.id
}

async function seedTv() {
  seedCounter++
  const { media, episodes } = await TestSeed.library.tv({
    tmdbId: 100 + seedCounter,
    title: 'Test Media',
    year: 2024,
    imdbId: 'tt0000001',
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        episodeCount: 3,
        episodes: [
          { episodeNumber: 1, title: 'Pilot' },
          { episodeNumber: 2, title: 'Second' },
        ],
      },
    ],
  })

  return { mediaId: media.id, tmdbMediaId: media.tmdb_media_id, episodes }
}

async function writeSrt(path: string) {
  await Bun.write(path, '1\n00:00:01,000 --> 00:00:02,000\nHello\n')
}

describe('scanner subtitle handling', () => {
  test('discovers and registers .srt file', async () => {
    const mediaId = await seedMovie()

    const srtPath = join(testDir, 'sub_en_abc123.srt')
    await writeSrt(srtPath)
    await TestSeed.downloads.completed(mediaId, { contentPath: testDir })

    await new Scanner().scan(mediaId)

    const files = await DbMediaFiles.getByMediaId(mediaId)

    expect(files).toHaveLength(1)
    expect(files[0].path).toBe(srtPath)
    expect(files[0].format_name).toBeNull()
    expect(files[0].duration).toBeNull()

    const tracks = await DbMediaTracks.getByMediaFileId(files[0].id)

    expect(tracks).toHaveLength(1)
    expect(tracks[0].stream_type).toBe('subtitle')
    expect(tracks[0].codec_name).toBe('subrip')
    expect(tracks[0].stream_index).toBe(0)
  })

  test('extracts language from sub_[lang]_ pattern', async () => {
    const mediaId = await seedMovie()

    const enPath = join(testDir, 'sub_en_hash1.srt')
    const ptPath = join(testDir, 'sub_pt_hash2.srt')
    await writeSrt(enPath)
    await writeSrt(ptPath)
    await TestSeed.downloads.completed(mediaId, { contentPath: testDir })

    await new Scanner().scan(mediaId)

    const tracks = await DbMediaTracks.getByMediaId(mediaId)
    const languages = tracks.map((t) => t.language).sort()

    expect(languages).toEqual(['en', 'pt'])
  })

  test('language is null when filename does not match pattern', async () => {
    const mediaId = await seedMovie()

    const srtPath = join(testDir, 'random_subtitle.srt')
    await writeSrt(srtPath)
    await TestSeed.downloads.completed(mediaId, { contentPath: testDir })

    await new Scanner().scan(mediaId)

    const tracks = await DbMediaTracks.getByMediaId(mediaId)

    expect(tracks).toHaveLength(1)
    expect(tracks[0].language).toBeNull()
  })

  test('associates subtitle with episode via directory name', async () => {
    const { mediaId, episodes } = await seedTv()

    const epDir = join(testDir, 's01e02')
    await mkdir(epDir, { recursive: true })

    const srtPath = join(epDir, 'sub_en_hash.srt')
    await writeSrt(srtPath)
    await TestSeed.downloads.completed(mediaId, { contentPath: testDir })

    await new Scanner().scan(mediaId)

    const files = await DbMediaFiles.getByMediaId(mediaId)

    expect(files).toHaveLength(1)
    expect(files[0].episode_id).toBe(episodes[1].id)
  })

  test('skips already registered subtitle on re-scan', async () => {
    const mediaId = await seedMovie()

    const srtPath = join(testDir, 'sub_en_abc.srt')
    await writeSrt(srtPath)
    await TestSeed.downloads.completed(mediaId, { contentPath: testDir })

    await new Scanner().scan(mediaId)
    await new Scanner().scan(mediaId)

    const files = await DbMediaFiles.getByMediaId(mediaId)

    expect(files).toHaveLength(1)
  })
})
