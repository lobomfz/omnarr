import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import '../helpers/api-server'
import { LibraryCommand } from '@/commands/library'
import { database, db } from '@/db/connection'
import { DbEpisodes } from '@/db/episodes'
import { DbSeasons } from '@/db/seasons'
import { deriveId } from '@/lib/utils'

const MOVIE_ID = deriveId('603:movie')
const TV_ID = deriveId('1399:tv')

async function setupMovie() {
  const tmdb = await db
    .insertInto('tmdb_media')
    .values({
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      year: 1999,
      imdb_id: 'tt0133093',
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  await db
    .insertInto('media')
    .values({
      id: MOVIE_ID,
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/tmp/omnarr-test-movies',
    })
    .execute()

  await db
    .insertInto('downloads')
    .values({
      media_id: MOVIE_ID,
      source_id: 'ABC123',
      download_url: 'https://beyond-hd.me/dl/abc123',
      source: 'torrent',
      status: 'downloading',
    })
    .execute()

  return tmdb.id
}

async function setupTvShow() {
  const tmdb = await db
    .insertInto('tmdb_media')
    .values({
      tmdb_id: 1399,
      media_type: 'tv',
      title: 'Breaking Bad',
      year: 2008,
      imdb_id: 'tt0903747',
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  await db
    .insertInto('media')
    .values({
      id: TV_ID,
      tmdb_media_id: tmdb.id,
      media_type: 'tv',
      root_folder: '/tmp/tv',
    })
    .execute()

  await db
    .insertInto('downloads')
    .values({
      media_id: TV_ID,
      source_id: 'BB_HASH_S01E01',
      download_url: 'https://beyond-hd.me/dl/bb_hash_s01e01',
      source: 'torrent',
      status: 'downloading',
    })
    .execute()

  return tmdb.id
}

describe('library command', () => {
  beforeEach(() => {
    database.reset()
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
    const tmdbMediaId = await setupTvShow()

    const seasons = await DbSeasons.upsert([
      {
        tmdb_media_id: tmdbMediaId,
        season_number: 1,
        episode_count: 7,
      },
      {
        tmdb_media_id: tmdbMediaId,
        season_number: 2,
        episode_count: 13,
      },
    ])

    const episodes = await DbEpisodes.upsert([
      { season_id: seasons[0].id, episode_number: 1 },
      { season_id: seasons[0].id, episode_number: 2 },
      { season_id: seasons[0].id, episode_number: 3 },
    ])

    const download = await database.kysely
      .selectFrom('downloads')
      .select('id')
      .executeTakeFirstOrThrow()

    await database.kysely
      .insertInto('media_files')
      .values([
        {
          media_id: TV_ID,
          download_id: download.id,
          episode_id: episodes[0].id,
          path: '/test/s01e01.mkv',
          size: 1000,
        },
        {
          media_id: TV_ID,
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
