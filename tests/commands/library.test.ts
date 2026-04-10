import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import '../helpers/api-server'
import { LibraryCommand } from '@/commands/library'
import { database } from '@/db/connection'

import { TestSeed } from '../helpers/seed'

async function setupMovie() {
  const media = await TestSeed.library.matrix()

  await TestSeed.downloads.torrent({
    mediaId: media.id,
    sourceId: 'ABC123',
  })
}

describe('library command', () => {
  beforeEach(() => {
    TestSeed.reset()
  })

  test('shows downloading status when torrent is active', async () => {
    await setupMovie()

    const result = await testCommand(LibraryCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)

    expect(rows).toHaveLength(1)
    expect(rows[0].download?.status).toBe('downloading')
  })

  test('shows downloaded status when torrent is completed but not scanned', async () => {
    await setupMovie()

    await database.kysely
      .updateTable('downloads')
      .set({ status: 'completed' })
      .execute()

    const result = await testCommand(LibraryCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)

    expect(rows).toHaveLength(1)
    expect(rows[0].download?.status).toBe('completed')
  })

  test('shows episode progress for TV shows', async () => {
    const { media, episodes } = await TestSeed.library.tv({
      tmdbId: 1399,
      title: 'Breaking Bad',
      year: 2008,
      imdbId: 'tt0903747',
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodeCount: 7,
          episodes: [
            { episodeNumber: 1, title: 'Pilot' },
            { episodeNumber: 2, title: "Cat's in the Bag..." },
            { episodeNumber: 3, title: "...And the Bag's in the River" },
          ],
        },
        {
          seasonNumber: 2,
          title: 'Season 2',
          episodeCount: 13,
        },
      ],
    })

    const download = await TestSeed.downloads.torrent({
      mediaId: media.id,
      sourceId: 'BB_HASH_S01E01',
    })

    await database.kysely
      .insertInto('media_files')
      .values([
        {
          media_id: media.id,
          download_id: download.id,
          episode_id: episodes[0].id,
          path: '/test/s01e01.mkv',
          size: 1000,
        },
        {
          media_id: media.id,
          download_id: download.id,
          episode_id: episodes[1].id,
          path: '/test/s01e02.mkv',
          size: 1000,
        },
      ])
      .execute()

    const result = await testCommand(LibraryCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)

    expect(rows).toHaveLength(1)
    expect(rows[0].total_episodes).toBe(20)
    expect(rows[0].episodes_with_files).toBe(2)
  })

  test('shows zero total_episodes for movies', async () => {
    await setupMovie()

    const result = await testCommand(LibraryCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)

    expect(rows).toHaveLength(1)
    expect(rows[0].total_episodes).toBe(0)
    expect(rows[0].episodes_with_files).toBe(0)
  })
})
