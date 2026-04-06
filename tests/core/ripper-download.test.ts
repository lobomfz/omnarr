import { beforeEach, describe, expect, test } from 'bun:test'

import { RipperDownload } from '@/core/ripper-download'
import { database, db } from '@/db/connection'
import { DbEvents } from '@/db/events'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { config } from '@/lib/config'
import { deriveId } from '@/lib/utils'

beforeEach(() => {
  database.reset()
})

async function seedMedia(tmdbId: number, imdbId: string) {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: tmdbId,
    media_type: 'movie',
    title: 'Ripper Source Test',
    imdb_id: imdbId,
    year: 2020,
  })

  return await DbMedia.create({
    id: deriveId(`${tmdbId}:movie`),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/tmp/omnarr-test-movies',
  })
}

async function seedTvMedia() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 903747,
    media_type: 'tv',
    title: 'Breaking Bad',
    imdb_id: 'tt0903747',
    year: 2008,
  })

  const media = await DbMedia.create({
    id: deriveId('903747:tv'),
    tmdb_media_id: tmdb.id,
    media_type: 'tv',
    root_folder: '/tv',
  })

  const season = await db
    .insertInto('seasons')
    .values({
      tmdb_media_id: tmdb.id,
      season_number: 1,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  await db
    .insertInto('episodes')
    .values([
      { season_id: season.id, episode_number: 1 },
      { season_id: season.id, episode_number: 2 },
      { season_id: season.id, episode_number: 3 },
    ])
    .execute()

  return media
}

describe('RipperDownload.enqueue', () => {
  test('creates download record and intention event', async () => {
    const media = await seedMedia(10001, 'tt0000001')

    const result = await new RipperDownload().enqueue({
      source_id: 'superflix:tt0000001',
      download_url: 'imdb:tt0000001',
      title: 'Test Enqueue',
      year: 2020,
      imdb_id: 'tt0000001',
      media_id: media.id,
      tracks_dir: `${config.root_folders!.tracks!}/${media.id}`,
    })

    expect(result.download_id).toBeDefined()
    expect(result.title).toBe('Test Enqueue')

    const download = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .where('id', '=', result.download_id)
      .executeTakeFirstOrThrow()

    expect(download.status).toBe('pending')
    expect(download.source).toBe('ripper')
    expect(download.source_id).toBe('superflix:tt0000001')

    const events = await DbEvents.getByMediaId(media.id)

    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('created')
    expect(events[0].message).toContain('Download started')
  })
})

describe('RipperDownload.enqueueSeason', () => {
  test('creates one download per episode', async () => {
    const media = await seedTvMedia()

    const result = await new RipperDownload().enqueue({
      source_id: 'superflix:tt0903747:1',
      download_url: 'imdb:tt0903747',
      title: 'Breaking Bad',
      year: 2008,
      imdb_id: 'tt0903747',
      media_id: media.id,
      tracks_dir: `${config.root_folders!.tracks!}/${media.id}`,
      season_number: 1,
    })

    expect(result.download_id).toBeDefined()

    const downloads = await database.kysely
      .selectFrom('downloads')
      .select(['source_id', 'status', 'season_number', 'episode_number'])
      .orderBy('id')
      .execute()

    expect(downloads).toHaveLength(3)

    for (const d of downloads) {
      expect(d.source_id).toBe('superflix:tt0903747:1')
      expect(d.status).toBe('pending')
      expect(d.season_number).toBe(1)
    }

    expect(downloads[0].episode_number).toBe(1)
    expect(downloads[1].episode_number).toBe(2)
    expect(downloads[2].episode_number).toBe(3)

    const events = await DbEvents.getByMediaId(media.id)
    const seasonEvent = events.find((e) => e.message.includes('3 episodes'))

    expect(seasonEvent).toBeDefined()
  })

  test('throws when season has no episodes', async () => {
    const media = await seedTvMedia()

    await expect(() =>
      new RipperDownload().enqueue({
        source_id: 'superflix:tt0903747:2',
        download_url: 'imdb:tt0903747',
        title: 'Breaking Bad',
        year: 2008,
        imdb_id: 'tt0903747',
        media_id: media.id,
        tracks_dir: `${config.root_folders!.tracks!}/${media.id}`,
        season_number: 2,
      })
    ).toThrow('No episodes found for season 2')
  })
})
