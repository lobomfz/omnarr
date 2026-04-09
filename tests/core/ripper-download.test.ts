import { beforeEach, describe, expect, test } from 'bun:test'

import { RipperDownload } from '@/core/ripper-download'
import { database } from '@/db/connection'
import { DbEvents } from '@/db/events'
import { config } from '@/lib/config'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

describe('RipperDownload.enqueue', () => {
  test('creates download record and intention event', async () => {
    const media = await TestSeed.library.movie({
      tmdbId: 10001,
      title: 'Ripper Source Test',
      year: 2020,
      imdbId: 'tt0000001',
    })

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
    const { media } = await TestSeed.library.tv({
      tmdbId: 903747,
      title: 'Breaking Bad',
      year: 2008,
      imdbId: 'tt0903747',
      rootFolder: '/tv',
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodeCount: 3,
          episodes: [
            { episodeNumber: 1, title: 'Pilot' },
            { episodeNumber: 2, title: "Cat's in the Bag..." },
            { episodeNumber: 3, title: "...And the Bag's in the River" },
          ],
        },
      ],
    })

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
    const { media } = await TestSeed.library.tv({
      tmdbId: 903747,
      title: 'Breaking Bad',
      year: 2008,
      imdbId: 'tt0903747',
      rootFolder: '/tv',
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodeCount: 3,
          episodes: [
            { episodeNumber: 1, title: 'Pilot' },
            { episodeNumber: 2, title: "Cat's in the Bag..." },
            { episodeNumber: 3, title: "...And the Bag's in the River" },
          ],
        },
      ],
    })

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
    ).toThrow('NO_EPISODES')
  })
})
