import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'
import { join } from 'path'

import { SubtitleDownload } from '@/core/subtitle-download'
import { db } from '@/db/connection'
import { config } from '@/lib/config'

import '../mocks/subdl'
import { TestSeed } from '../helpers/seed'

const tracksDir = config.root_folders!.tracks!

beforeEach(async () => {
  TestSeed.reset()
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

afterAll(async () => {
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

describe('SubtitleDownload.download', () => {
  test('downloads subtitle and returns path with download_id', async () => {
    const media = await TestSeed.library.matrix()
    const mediaId = media.id
    const mediaTracksDir = join(tracksDir, mediaId)

    const result = await new SubtitleDownload().download({
      source_id: 'SUBDL:100-200',
      download_url: 'http://localhost:19007/subtitle/100-200.zip',
      media_id: mediaId,
      tracks_dir: mediaTracksDir,
      language: 'EN',
    })

    expect(result).not.toBeNull()
    expect(result!.path).toContain('.srt')
    expect(result!.download_id).toBeGreaterThan(0)

    const download = await db
      .selectFrom('downloads')
      .where('id', '=', result!.download_id)
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('completed')
    expect(download.source).toBe('subtitle')
    expect(download.progress).toBe(1)
    expect(download.content_path).toContain('.srt')
  })

  test('saves .srt file to disk', async () => {
    const media = await TestSeed.library.matrix()
    const mediaId = media.id
    const mediaTracksDir = join(tracksDir, mediaId)

    const result = await new SubtitleDownload().download({
      source_id: 'SUBDL:100-200',
      download_url: 'http://localhost:19007/subtitle/100-200.zip',
      media_id: mediaId,
      tracks_dir: mediaTracksDir,
      language: 'EN',
    })

    const file = Bun.file(result!.path)

    expect(await file.exists()).toBe(true)

    const text = await file.text()

    expect(text).toContain('Test subtitle')
  })

  test('returns null when archive has no .srt', async () => {
    const media = await TestSeed.library.matrix()
    const mediaId = media.id
    const mediaTracksDir = join(tracksDir, mediaId)

    const result = await new SubtitleDownload().download({
      source_id: 'SUBDL:no-srt',
      download_url: 'http://localhost:19007/subtitle/no-srt.zip',
      media_id: mediaId,
      tracks_dir: mediaTracksDir,
    })

    expect(result).toBeNull()

    const download = await db
      .selectFrom('downloads')
      .where('source', '=', 'subtitle')
      .selectAll()
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('error')
    expect(download.error_at).not.toBeNull()
  })

  test('places episode subtitle in season/episode subdirectory', async () => {
    const media = await TestSeed.library.matrix()
    const mediaId = media.id
    const mediaTracksDir = join(tracksDir, mediaId)

    const result = await new SubtitleDownload().download({
      source_id: 'SUBDL:100-200',
      download_url: 'http://localhost:19007/subtitle/100-200.zip',
      media_id: mediaId,
      tracks_dir: mediaTracksDir,
      season_number: 1,
      episode_number: 3,
    })

    expect(result).not.toBeNull()
    expect(result!.path).toContain('s01e03')
  })
})

describe('SubtitleDownload.enqueueSeasonPack', () => {
  test('throws when archive has no .srt files', async () => {
    const media = await TestSeed.library.matrix()
    const mediaId = media.id

     expect(() =>
      new SubtitleDownload().enqueue({
        source_id: 'SUBDL:no-srt-pack',
        download_url: 'http://localhost:19007/subtitle/no-srt-pack.zip',
        title: 'Test',
        year: 1999,
        imdb_id: 'tt0133093',
        media_id: mediaId,
        tracks_dir: join(tracksDir, mediaId),
        season_number: 1,
      })
    ).toThrow('NO_SRT_IN_ARCHIVE')
  })

  test('throws when .srt files have no episode patterns', async () => {
    const media = await TestSeed.library.matrix()
    const mediaId = media.id

     expect(() =>
      new SubtitleDownload().enqueue({
        source_id: 'SUBDL:no-pattern',
        download_url: 'http://localhost:19007/subtitle/no-pattern.zip',
        title: 'Test',
        year: 1999,
        imdb_id: 'tt0133093',
        media_id: mediaId,
        tracks_dir: join(tracksDir, mediaId),
        season_number: 1,
      })
    ).toThrow('NO_SRT_EPISODE_PATTERN')
  })
})
