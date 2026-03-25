import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import { DownloadCommand } from '@/commands/download'
import { database } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { Formatters } from '@/formatters'
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
  const releaseId = releases[0].id

  beforeEach(() => {
    database.reset('media_tracks')
    database.reset('media_files')
    database.reset('downloads')
    database.reset('media')
    database.reset('tmdb_media')
    QBittorrentMock.reset()
  })

  test('shows downloading status when torrent is active', async () => {
    await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: {},
    })

    const media = await DbMedia.list()

    expect(media).toHaveLength(1)
    expect(Formatters.mediaStatus(media[0])).toBe('downloading')
  })

  test('shows downloaded status when torrent is completed but not scanned', async () => {
    await testCommand(DownloadCommand, {
      args: [releaseId],
      flags: {},
    })

    await database.kysely
      .updateTable('downloads')
      .set({ status: 'completed' })
      .execute()

    const media = await DbMedia.list()

    expect(media).toHaveLength(1)
    expect(Formatters.mediaStatus(media[0])).toBe('downloaded')
  })
})
