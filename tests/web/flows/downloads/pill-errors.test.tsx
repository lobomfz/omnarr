import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/beyond-hd'
import '../../../mocks/subdl'
import '../../../mocks/superflix'
import '../../../mocks/tmdb'
import '../../../mocks/yts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { TorrentSync } from '@/core/torrent-sync'
import { database } from '@/db/connection'
import { deriveId } from '@/lib/utils'

import { TestSeed } from '../../../helpers/seed'
import { QBittorrentMock } from '../../../mocks/qbittorrent'
import { get, query, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { act, cleanup, waitFor } from '../../testing-library'
import { flush, seedDownload, waitForDownloadProgressStream } from './helpers'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(() => cleanup())

describe('errors and conflicts', () => {
  test('failed download leaves pill immediately', async () => {
    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
    })

    const { queryClient } = mountApp('/')

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 5000 }
    )

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await waitForDownloadProgressStream(queryClient)

    await act(async () => {
      await new TorrentSync().sync()
    })

    await flush()

    await waitFor(
      () => {
        expect(query('download-pill', { nav: 'desktop' })).toBeNull()
      },
      { timeout: 3000 }
    )
  })

  test('detail page shows error badge with timestamp when download fails', async () => {
    const { mediaId } = await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
    })

    const { queryClient } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(get('library-release-row').dataset.state).toBe('downloading')
      },
      { timeout: 5000 }
    )

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await waitForDownloadProgressStream(queryClient)

    await act(async () => {
      await new TorrentSync().sync()
    })

    await flush()

    await waitFor(
      () => {
        expect(get('library-release-row').dataset.state).toBe('error')
      },
      { timeout: 3000 }
    )

    const errorRow = await database.kysely
      .selectFrom('downloads')
      .where('source_id', '=', 'ABC123')
      .select(['error_at'])
      .executeTakeFirstOrThrow()

    expect(errorRow.error_at).not.toBeNull()
    expect(get('library-release-row').dataset.errorAt).toBe(
      errorRow.error_at!.toISOString()
    )
  })

  test('recovered download reappears in pill after error', async () => {
    const { mediaId } = await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
      status: 'error',
    })

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ state: 'downloading', progress: 0.2, dlspeed: 500_000 })
      .where('hash', '=', 'abc123')
      .execute()

    const { queryClient } = mountApp('/')

    await waitFor(
      () => {
        get('media-card', { 'media-id': mediaId })
      },
      { timeout: 5000 }
    )

    expect(query('download-pill', { nav: 'desktop' })).toBeNull()

    await waitForDownloadProgressStream(queryClient)

    await act(async () => {
      await new TorrentSync().sync()
    })

    await flush()

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 3000 }
    )
  })

  test('download error shows error indicator on media card in library grid', async () => {
    const { mediaId } = await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
    })

    const { queryClient } = mountApp('/')

    await waitFor(
      () => {
        get('media-card', { 'media-id': mediaId })
      },
      { timeout: 5000 }
    )

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await waitForDownloadProgressStream(queryClient)

    await act(async () => {
      await new TorrentSync().sync()
    })

    await flush()

    await waitFor(
      () => {
        expect(
          get('media-card', { 'media-id': mediaId }).dataset.errorCount
        ).toBeDefined()
      },
      { timeout: 3000 }
    )
  })

  test('duplicate download shows user-friendly conflict message', async () => {
    await TestSeed.library.matrix()
    const mediaId = deriveId('603:movie')

    await database.kysely
      .insertInto('downloads')
      .values({
        media_id: mediaId,
        source_id: 'ABC123',
        download_url: 'https://beyond-hd.me/dl/abc123',
        source: 'torrent',
        status: 'downloading',
        progress: 0.3,
      })
      .execute()

    await QBittorrentMock.db
      .insertInto('torrents')
      .values({
        hash: 'abc123',
        url: 'https://beyond-hd.me/dl/abc123',
        savepath: '',
        category: 'omnarr',
        progress: 0.3,
        dlspeed: 1_000_000,
        eta: 300,
        state: 'downloading',
        content_path: '/abc123',
      })
      .execute()

    const { user } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        get('release-row', { 'source-id': 'ABC123' })
      },
      { timeout: 5000 }
    )

    await user.click(get('release-row', { 'source-id': 'ABC123' }))
    await user.click(slot(get('action-bar'), 'download'))

    await waitFor(
      () => {
        expect(get('toast').dataset.code).toBe('DUPLICATE_DOWNLOAD')
      },
      { timeout: 3000 }
    )
  })
})
