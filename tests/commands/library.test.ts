import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import { LibraryCommand } from '@/commands/library'
import { database, type indexer_source } from '@/db/connection'
import { DbEpisodes } from '@/db/episodes'
import { DbReleases } from '@/db/releases'
import { DbSeasons } from '@/db/seasons'
import { Downloads } from '@/core/downloads'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Releases } from '@/core/releases'

const noop = () => {}

import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'
import '../mocks/qbittorrent'
import { QBittorrentMock } from '../mocks/qbittorrent'

describe('library command', async () => {
  const results = await new TmdbClient().search('Matrix')
  const releases = await new Releases().search(
    results[0].tmdb_id,
    results[0].media_type
  )
  const release = (await DbReleases.getById(releases[0].id))!

  const addParams = {
    tmdb_id: release.tmdb_id,
    source_id: release.source_id,
    download_url: release.download_url,
    type: release.media_type,
    indexer_source: release.indexer_source as indexer_source,
  }

  beforeEach(() => {
    database.reset()
    QBittorrentMock.reset()
  })

  test('shows downloading status when torrent is active', async () => {
    await new Downloads().add(addParams, noop)

    const result = await testCommand(LibraryCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)

    expect(rows).toHaveLength(1)
    expect(rows[0].download_status).toBe('downloading')
  })

  test('shows downloaded status when torrent is completed but not scanned', async () => {
    await new Downloads().add(addParams, noop)

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
    expect(rows[0].download_status).toBe('completed')
  })

  test('shows episode progress for TV shows', async () => {
    await new Downloads().add(
      {
        tmdb_id: 1399,
        source_id: 'bb_hash_s01e01',
        download_url: 'https://beyond-hd.me/dl/bb_hash_s01e01',
        type: 'tv',
        indexer_source: 'beyond-hd',
      },
      noop
    )

    const media = await database.kysely
      .selectFrom('media')
      .select(['id', 'tmdb_media_id'])
      .executeTakeFirstOrThrow()

    const seasons = await DbSeasons.upsert([
      {
        tmdb_media_id: media.tmdb_media_id,
        season_number: 1,
        episode_count: 7,
      },
      {
        tmdb_media_id: media.tmdb_media_id,
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
    await new Downloads().add(addParams, noop)

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
