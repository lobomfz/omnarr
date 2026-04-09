import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'
import { join } from 'path'

import { PubSub } from '@/api/pubsub'
import { Ripper } from '@/core/ripper'
import { database } from '@/db/connection'
import { config } from '@/lib/config'

import '../mocks/superflix'
import { TestSeed } from '../helpers/seed'

const tracksDir = config.root_folders!.tracks!

beforeEach(async () => {
  TestSeed.reset()
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

afterAll(async () => {
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

async function seedMedia(tmdbId: number, imdbId: string) {
  const media = await TestSeed.library.movie({
    tmdbId,
    title: 'Ripper Test',
    year: 2020,
    imdbId,
  })

  return media.id
}

async function seedDownload(mediaId: string, sourceId: string) {
  return await TestSeed.downloads.ripper({ mediaId, sourceId })
}

describe('Ripper.run', () => {
  test('updates download status to downloading', async () => {
    const mediaId = await seedMedia(10001, 'tt0000001')
    const download = await seedDownload(mediaId, 'ripper:test:status')

    await new Ripper({
      download_id: download.id,
      media_id: mediaId,
      source_id: 'ripper:test:status',
      imdb_id: 'tt0000001',
      tracks_dir: `${tracksDir}/${mediaId}`,
    }).run()

    const updated = await database.kysely
      .selectFrom('downloads')
      .select('status')
      .where('id', '=', download.id)
      .executeTakeFirstOrThrow()

    expect(updated.status).toBe('downloading')
  })

  test('completes when some streams fail', async () => {
    const mediaId = await seedMedia(10001, 'tt0000001')
    const download = await seedDownload(mediaId, 'ripper:test:partial')

    const result = await new Ripper({
      download_id: download.id,
      media_id: mediaId,
      source_id: 'ripper:test:partial',
      imdb_id: 'tt0000001',
      tracks_dir: `${tracksDir}/${mediaId}`,
    }).run()

    expect(result.ripped).toBe(1)
    expect(result.total).toBe(2)
  })

  test('returns zero when all streams fail', async () => {
    const mediaId = await seedMedia(10002, 'tt9999999')
    const download = await seedDownload(mediaId, 'ripper:test:allfail')

    const result = await new Ripper({
      download_id: download.id,
      media_id: mediaId,
      source_id: 'ripper:test:allfail',
      imdb_id: 'tt9999999',
      tracks_dir: `${tracksDir}/${mediaId}`,
    }).run()

    expect(result.ripped).toBe(0)
    expect(result.total).toBe(0)
  })

  test('updates progress in database', async () => {
    const mediaId = await seedMedia(10001, 'tt0000001')
    const download = await seedDownload(mediaId, 'ripper:test:progress')

    await new Ripper({
      download_id: download.id,
      media_id: mediaId,
      source_id: 'ripper:test:progress',
      imdb_id: 'tt0000001',
      tracks_dir: `${tracksDir}/${mediaId}`,
    }).run()

    const updated = await database.kysely
      .selectFrom('downloads')
      .select('progress')
      .where('id', '=', download.id)
      .executeTakeFirstOrThrow()

    expect(updated.progress).toBe(1)
  })

  test('publishes intermediate progress during entry download', async () => {
    const mediaId = await seedMedia(10003, 'tt0133093')
    const download = await seedDownload(mediaId, 'ripper:test:interp')

    const events: { progress: number }[] = []
    const ac = new AbortController()

    const collecting = (async () => {
      for await (const event of PubSub.subscribe(
        'download_progress',
        ac.signal
      )) {
        events.push({ progress: event.progress })
      }
    })().catch(() => {})

    await new Ripper({
      download_id: download.id,
      media_id: mediaId,
      source_id: 'ripper:test:interp',
      imdb_id: 'tt0133093',
      tracks_dir: `${tracksDir}/${mediaId}`,
    }).run()

    await Bun.sleep(50)
    ac.abort()
    await collecting

    // 3 entries (1 video + 2 audio). Boundaries at 0, 1/3, 2/3, 1.
    // An intermediate value should exist strictly between entry boundaries.
    const boundaries = [0, 1 / 3, 2 / 3, 1]
    const hasIntermediate = events.some((e) =>
      boundaries.every((b) => Math.abs(e.progress - b) > 0.01)
    )

    expect(hasIntermediate).toBe(true)
  })

  test('publishes exact ratio at per-entry completion boundaries', async () => {
    const mediaId = await seedMedia(10004, 'tt0133093')
    const download = await seedDownload(mediaId, 'ripper:test:boundary')

    const events: { progress: number }[] = []
    const ac = new AbortController()

    const collecting = (async () => {
      for await (const event of PubSub.subscribe(
        'download_progress',
        ac.signal
      )) {
        events.push({ progress: event.progress })
      }
    })().catch(() => {})

    await new Ripper({
      download_id: download.id,
      media_id: mediaId,
      source_id: 'ripper:test:boundary',
      imdb_id: 'tt0133093',
      tracks_dir: `${tracksDir}/${mediaId}`,
    }).run()

    await Bun.sleep(50)
    ac.abort()
    await collecting

    const hasExact = (target: number) =>
      events.some((e) => Math.abs(e.progress - target) < 1e-9)

    expect(hasExact(1 / 3)).toBe(true)
    expect(hasExact(2 / 3)).toBe(true)
    expect(hasExact(1)).toBe(true)
  })

  test('creates files in episode subdirectory for TV', async () => {
    const { media } = await TestSeed.library.tv({
      tmdbId: 903747,
      title: 'TV Ripper Test',
      year: 2008,
      imdbId: 'tt0903747',
      rootFolder: '/tmp/omnarr-test-tv',
      seasons: [],
    })

    const download = await seedDownload(media.id, 'ripper:test:tv')

    const result = await new Ripper({
      download_id: download.id,
      media_id: media.id,
      source_id: 'ripper:test:tv',
      imdb_id: 'tt0903747',
      tracks_dir: `${tracksDir}/${media.id}`,
      season_number: 1,
      episode_number: 1,
    }).run()

    expect(result.ripped).toBeGreaterThan(0)

    const episodeDir = join(tracksDir, media.id, 's01e01')
    const files = await Array.fromAsync(
      new Bun.Glob('*').scan({ cwd: episodeDir })
    )

    expect(files.length).toBeGreaterThan(0)
  })
})
