import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/beyond-hd'
import '../../../mocks/subdl'
import '../../../mocks/superflix'
import '../../../mocks/tmdb'
import '../../../mocks/yts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { cleanup, waitFor, within } from '@testing-library/react'
import dayjs from 'dayjs'

import { TorrentSync } from '@/core/torrent-sync'
import { database } from '@/db/connection'
import { deriveId } from '@/lib/utils'

import { QBittorrentMock } from '../../../mocks/qbittorrent'
import { mountApp } from '../../mount-app'
import {
  resetDownloadState,
  seedDownload,
  seedMatrixInLibrary,
} from './helpers'

beforeEach(() => {
  resetDownloadState()
})

afterEach(() => {
  cleanup()
})

describe('errors and conflicts', () => {
  const q = within(document.body)

  function pillButtons(name: string) {
    return q.queryAllByRole('button', { name })
  }

  test('failed download leaves pill immediately', async () => {
    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
    })

    mountApp('/')

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

    await waitFor(
      () => {
        expect(pillButtons('1')).toHaveLength(0)
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

    mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(q.getAllByText(/Downloading/i).length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

    await waitFor(
      () => {
        expect(q.getAllByText(/Error/i).length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )

    const errorRow = await database.kysely
      .selectFrom('downloads')
      .where('source_id', '=', 'ABC123')
      .select(['error_at'])
      .executeTakeFirstOrThrow()

    expect(errorRow.error_at).not.toBeNull()

    const expected = dayjs(errorRow.error_at!).format('YYYY-MM-DD')

    expect(q.getAllByText(new RegExp(expected)).length).toBeGreaterThan(0)
  })

  test('recovered download reappears in pill after error', async () => {
    await seedDownload({
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

    mountApp('/')

    await waitFor(
      () => {
        expect(q.getAllByText('The Matrix').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    expect(pillButtons('1')).toHaveLength(0)

    await new TorrentSync().sync()

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  test('download error shows error indicator on media card in library grid', async () => {
    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
    })

    mountApp('/')

    await waitFor(
      () => {
        expect(q.getAllByText('The Matrix').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await QBittorrentMock.db
      .deleteFrom('torrents')
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

    await waitFor(
      () => {
        const dots = document.querySelectorAll('.bg-destructive')
        expect(dots.length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  test('duplicate download shows user-friendly conflict message', async () => {
    await seedMatrixInLibrary()
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

    const addReleaseBtn = await q.findByRole(
      'button',
      { name: /Add Release/i },
      { timeout: 5000 }
    )

    await user.click(addReleaseBtn)

    const release = await q.findByRole(
      'button',
      { name: /The\.Matrix\.1999\.2160p/ },
      { timeout: 5000 }
    )

    await user.click(release)

    const downloadBtn = await q.findByRole('button', {
      name: /^Download$/,
    })

    await user.click(downloadBtn)

    await q.findByText(/already/i, undefined, { timeout: 3000 })
  })
})
