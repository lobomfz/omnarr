import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/beyond-hd'
import '../../../mocks/subdl'
import '../../../mocks/superflix'
import '../../../mocks/tmdb'
import '../../../mocks/yts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { cleanup, waitFor, within } from '@testing-library/react'

import { PubSub } from '@/api/pubsub'
import { DownloadEvents } from '@/core/download-events'
import { TorrentSync } from '@/core/torrent-sync'
import { DbDownloads } from '@/db/downloads'
import { scanQueue } from '@/jobs/queues'

import { QBittorrentMock } from '../../../mocks/qbittorrent'
import { mountApp } from '../../mount-app'
import { resetDownloadState, seedDownload } from './helpers'

beforeEach(() => {
  resetDownloadState()
})

afterEach(() => {
  cleanup()
})

describe('terminal transitions clear the pill', () => {
  const q = within(document.body)

  function pillButtons(name: string) {
    return q.queryAllByRole('button', { name })
  }

  test('live progress from WS updates pill and detail page consistently', async () => {
    const { mediaId, downloadId } = await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
    })

    mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      progress: 0.5,
      speed: 2_000_000,
      eta: 300,
    })

    await DownloadEvents.publish(downloadId)

    await waitFor(
      () => {
        expect(q.getAllByText('50%').length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  test('progress update for unknown download adds it to the pill', async () => {
    mountApp('/')

    await q.findByText(/Your library is empty/i, undefined, { timeout: 5000 })

    await PubSub.publish('download_progress', {
      id: 99999,
      media_id: 'XXXXXX',
      source_id: 'GHOST',
      progress: 0.5,
      speed: 1000,
      eta: 100,
      status: 'downloading',
      title: 'Ghost Movie',
      year: 2024,
      poster_path: null,
      error_at: null,
      active: true,
      unread_error_count: 0,
    })

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  test('pill shows count and aggregate for multiple active downloads', async () => {
    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
      progress: 0.4,
    })

    await seedDownload({
      tmdbId: 9998,
      title: 'Second Movie',
      sourceId: 'DEF456',
      progress: 0.6,
    })

    mountApp('/')

    await waitFor(
      () => {
        expect(pillButtons('2').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )
  })

  test('completed download leaves pill immediately', async () => {
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
      .updateTable('torrents')
      .set({ progress: 1, dlspeed: 0, eta: 0, state: 'uploading' })
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

  test('seeding torrent is not shown in pill', async () => {
    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
      progress: 1,
      status: 'seeding',
    })

    mountApp('/')

    await waitFor(
      () => {
        expect(q.getAllByText('The Matrix').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    expect(pillButtons('1')).toHaveLength(0)
  })

  test('paused torrent is not shown in pill', async () => {
    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
      progress: 0.3,
      status: 'paused',
    })

    mountApp('/')

    await waitFor(
      () => {
        expect(q.getAllByText('The Matrix').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    expect(pillButtons('1')).toHaveLength(0)
  })

  test('counter decrements when one of three downloads completes', async () => {
    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
      progress: 0.3,
    })

    await seedDownload({
      tmdbId: 9998,
      title: 'Second Movie',
      sourceId: 'DEF456',
      progress: 0.5,
    })

    await seedDownload({
      tmdbId: 10001,
      title: 'Third Movie',
      sourceId: 'GHI789',
      progress: 0.7,
    })

    mountApp('/')

    await waitFor(
      () => {
        expect(pillButtons('3').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ progress: 1, dlspeed: 0, eta: 0, state: 'uploading' })
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

    await waitFor(
      () => {
        expect(pillButtons('2').length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  test('paused then resumed download leaves and re-enters pill', async () => {
    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
      progress: 0.3,
    })

    mountApp('/')

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ state: 'pausedDL' })
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

    await waitFor(
      () => {
        expect(pillButtons('1')).toHaveLength(0)
      },
      { timeout: 3000 }
    )

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ state: 'downloading', progress: 0.5, dlspeed: 1_000_000 })
      .where('hash', '=', 'abc123')
      .execute()

    await new TorrentSync().sync()

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  test('torrent completing during sync triggers automatic scan', async () => {
    const { mediaId } = await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
    })

    await QBittorrentMock.db
      .updateTable('torrents')
      .set({ progress: 1, dlspeed: 0, eta: 0, state: 'uploading' })
      .where('hash', '=', 'abc123')
      .execute()

    const result = await new TorrentSync().sync()

    expect(result.completed).toContain(mediaId)

    const scanJobs = scanQueue.getJobs()
    const scanForMedia = scanJobs.find((j) => j.data.media_id === mediaId)

    expect(scanForMedia).toBeDefined()
  })
})
