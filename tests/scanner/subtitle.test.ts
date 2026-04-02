import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { database, db } from '@/db/connection'
import { DbEpisodes } from '@/db/episodes'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbSeasons } from '@/db/seasons'
import { Scanner } from '@/core/scanner'
import { deriveId } from '@/lib/utils'

const testDir = join(tmpdir(), 'omnarr-scanner-subtitle-test')
const noop = () => {}

beforeEach(async () => {
  database.reset()
  await rm(testDir, { recursive: true }).catch(() => {})
  await mkdir(testDir, { recursive: true })
})

afterAll(async () => {
  await rm(testDir, { recursive: true }).catch(() => {})
})

async function seedMedia(opts: {
  media_type: 'movie' | 'tv'
  tmdb_id: number
}) {
  const tmdb = await db
    .insertInto('tmdb_media')
    .values({
      tmdb_id: opts.tmdb_id,
      media_type: opts.media_type,
      title: 'Test Media',
      year: 2024,
      imdb_id: 'tt0000001',
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const mediaId = deriveId(`${opts.tmdb_id}:${opts.media_type}`)

  await db
    .insertInto('media')
    .values({
      id: mediaId,
      tmdb_media_id: tmdb.id,
      media_type: opts.media_type,
      root_folder: '/media',
    })
    .execute()

  return { mediaId, tmdbMediaId: tmdb.id }
}

async function seedDownload(mediaId: string, contentPath: string) {
  return await db
    .insertInto('downloads')
    .values({
      media_id: mediaId,
      source_id: `test-${Date.now()}`,
      download_url: 'magnet:?test',
      source: 'torrent',
      status: 'completed',
      content_path: contentPath,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()
}

async function writeSrt(path: string) {
  await Bun.write(path, '1\n00:00:01,000 --> 00:00:02,000\nHello\n')
}

describe('scanner subtitle handling', () => {
  test('discovers and registers .srt file', async () => {
    const { mediaId } = await seedMedia({ media_type: 'movie', tmdb_id: 100 })

    const srtPath = join(testDir, 'sub_en_abc123.srt')
    await writeSrt(srtPath)
    await seedDownload(mediaId, testDir)

    await new Scanner().scan(mediaId, noop)

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
    const { mediaId } = await seedMedia({ media_type: 'movie', tmdb_id: 101 })

    const enPath = join(testDir, 'sub_en_hash1.srt')
    const ptPath = join(testDir, 'sub_pt_hash2.srt')
    await writeSrt(enPath)
    await writeSrt(ptPath)
    await seedDownload(mediaId, testDir)

    await new Scanner().scan(mediaId, noop)

    const tracks = await DbMediaTracks.getByMediaId(mediaId)
    const languages = tracks.map((t) => t.language).sort()

    expect(languages).toEqual(['en', 'pt'])
  })

  test('language is null when filename does not match pattern', async () => {
    const { mediaId } = await seedMedia({ media_type: 'movie', tmdb_id: 102 })

    const srtPath = join(testDir, 'random_subtitle.srt')
    await writeSrt(srtPath)
    await seedDownload(mediaId, testDir)

    await new Scanner().scan(mediaId, noop)

    const tracks = await DbMediaTracks.getByMediaId(mediaId)

    expect(tracks).toHaveLength(1)
    expect(tracks[0].language).toBeNull()
  })

  test('associates subtitle with episode via directory name', async () => {
    const { mediaId, tmdbMediaId } = await seedMedia({
      media_type: 'tv',
      tmdb_id: 103,
    })

    const seasons = await DbSeasons.upsert([
      { tmdb_media_id: tmdbMediaId, season_number: 1, episode_count: 3 },
    ])

    const episodes = await DbEpisodes.upsert([
      { season_id: seasons[0].id, episode_number: 1, title: 'Pilot' },
      { season_id: seasons[0].id, episode_number: 2, title: 'Second' },
    ])

    const epDir = join(testDir, 's01e02')
    await mkdir(epDir, { recursive: true })

    const srtPath = join(epDir, 'sub_en_hash.srt')
    await writeSrt(srtPath)
    await seedDownload(mediaId, testDir)

    await new Scanner().scan(mediaId, noop)

    const files = await DbMediaFiles.getByMediaId(mediaId)

    expect(files).toHaveLength(1)
    expect(files[0].episode_id).toBe(episodes[1].id)
  })

  test('skips already registered subtitle on re-scan', async () => {
    const { mediaId } = await seedMedia({ media_type: 'movie', tmdb_id: 104 })

    const srtPath = join(testDir, 'sub_en_abc.srt')
    await writeSrt(srtPath)
    await seedDownload(mediaId, testDir)

    await new Scanner().scan(mediaId, noop)
    await new Scanner().scan(mediaId, noop)

    const files = await DbMediaFiles.getByMediaId(mediaId)

    expect(files).toHaveLength(1)
  })
})
