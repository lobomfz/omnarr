import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import { LibraryCommand } from '@/commands/library'
import { database } from '@/db/connection'
import { DbReleases } from '@/db/releases'
import { Downloads } from '@/downloads'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Releases } from '@/releases'

import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'
import '../mocks/qbittorrent'
import { QBittorrentMock } from '../mocks/qbittorrent'

describe('library command', async () => {
  const results = await new TmdbClient().search('Matrix')
  const releases = await Releases.search(
    results[0].tmdb_id,
    results[0].media_type
  )
  const release = (await DbReleases.getById(releases[0].id))!

  const addParams = {
    tmdb_id: release.tmdb_id,
    info_hash: release.info_hash,
    download_url: release.download_url,
    type: release.media_type,
  }

  beforeEach(() => {
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    QBittorrentMock.reset()
  })

  test('shows downloading status when torrent is active', async () => {
    await new Downloads().add(addParams)

    const result = await testCommand(LibraryCommand, {
      args: [],
      flags: { json: true },
    })

    const rows = JSON.parse(result.stdout)

    expect(rows).toHaveLength(1)
    expect(rows[0].download_status).toBe('downloading')
  })

  test('shows downloaded status when torrent is completed but not scanned', async () => {
    await new Downloads().add(addParams)

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
})
