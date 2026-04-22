import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/beyond-hd'
import '../../../mocks/subdl'
import '../../../mocks/superflix'
import '../../../mocks/tmdb'
import '../../../mocks/yts'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from 'bun:test'

import { DownloadEvents } from '@/core/download-events'
import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { ripperQueue } from '@/jobs/queues'
import { deriveId } from '@/lib/utils'

import { TestSeed } from '../../../helpers/seed'
import { get, query, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, waitFor } from '../../testing-library'
import {
  flush,
  seedRipperDownload,
  waitForDownloadProgressStream,
} from './helpers'

beforeEach(() => {
  TestSeed.reset()
  ripperQueue.clear()
})

setDefaultTimeout(10_000)

afterEach(() => cleanup())

describe('ripper lifecycle', () => {
  test('adding single-episode ripper release shows download in pill', async () => {
    await TestSeed.library.matrix()
    const mediaId = deriveId('603:movie')

    const { user } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        get('release-row', { 'source-id': 'SUPERFLIX:TT0133093' })
      },
      { timeout: 5000 }
    )

    await user.click(get('release-row', { 'source-id': 'SUPERFLIX:TT0133093' }))

    await waitFor(() => {
      slot(get('action-bar'), 'download')
    })

    await user.click(slot(get('action-bar'), 'download'))

    await waitFor(
      () => {
        expect(get('toast').dataset.code).toBe('DOWNLOAD_STARTED')
      },
      { timeout: 2000 }
    )

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 2000 }
    )
  })

  test('adding ripper season pack shows every episode in pill', async () => {
    await TestSeed.library.breakingBad()
    const mediaId = deriveId('1399:tv')

    const { user } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        get('release-row', { 'source-id': 'SUPERFLIX:TT0903747:1' })
      },
      { timeout: 5000 }
    )

    await user.click(
      get('release-row', { 'source-id': 'SUPERFLIX:TT0903747:1' })
    )

    await waitFor(() => {
      slot(get('action-bar'), 'download')
    })

    await user.click(slot(get('action-bar'), 'download'))

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('3')
      },
      { timeout: 2000 }
    )
  })

  test('ripper season pack with no episodes shows error message', async () => {
    await TestSeed.library.breakingBad({ withEpisodes: false })
    const mediaId = deriveId('1399:tv')

    const { user } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        get('release-row', { 'source-id': 'SUPERFLIX:TT0903747:1' })
      },
      { timeout: 5000 }
    )

    await user.click(
      get('release-row', { 'source-id': 'SUPERFLIX:TT0903747:1' })
    )

    await waitFor(() => {
      slot(get('action-bar'), 'download')
    })

    await user.click(slot(get('action-bar'), 'download'))

    await waitFor(
      () => {
        expect(get('toast').dataset.code).toBe('NO_EPISODES')
      },
      { timeout: 5000 }
    )

    const downloads = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .execute()

    expect(downloads).toHaveLength(0)
  })

  test('speed is displayed in pill popover and detail page', async () => {
    await TestSeed.library.matrix()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:speed:1',
      status: 'downloading',
      progress: 0.3,
    })

    const { queryClient } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      progress: 0.5,
      speed: 5_000_000,
    })

    await waitForDownloadProgressStream(queryClient)

    await DownloadEvents.publish(downloadId)

    await flush()

    await waitFor(
      () => {
        expect(get('library-release-row').dataset.speed).toBe('5000000')
      },
      { timeout: 5000 }
    )
  })

  test('ripper progress updates are reflected in the UI', async () => {
    await TestSeed.library.matrix()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:progress:1',
      status: 'downloading',
      progress: 0,
    })

    const { queryClient } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      progress: 0.75,
    })

    await waitForDownloadProgressStream(queryClient)

    await DownloadEvents.publish(downloadId)

    await flush()

    await waitFor(
      () => {
        expect(get('library-release-row').dataset.downloadProgress).toBe('0.75')
      },
      { timeout: 5000 }
    )
  })

  test('completed ripper download leaves pill and detail shows completion', async () => {
    await TestSeed.library.matrix()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:complete:1',
      status: 'downloading',
      progress: 0.8,
    })

    const { queryClient } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      status: 'completed',
      progress: 1,
    })

    await waitForDownloadProgressStream(queryClient)

    await DownloadEvents.publish(downloadId)

    await flush()

    await waitFor(
      () => {
        expect(query('download-pill', { nav: 'desktop' })).toBeNull()
      },
      { timeout: 5000 }
    )
  })

  test('ripper zero-rip failure leaves pill and shows error badge', async () => {
    await TestSeed.library.matrix()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:zerorip:1',
      status: 'downloading',
      progress: 0,
    })

    const { queryClient } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      status: 'error',
      error_at: new Date(),
    })

    await waitForDownloadProgressStream(queryClient)

    await DownloadEvents.publish(downloadId)

    await flush()

    await waitFor(
      () => {
        expect(query('download-pill', { nav: 'desktop' })).toBeNull()
      },
      { timeout: 5000 }
    )

    expect(get('library-release-row').dataset.state).toBe('error')
  })

  test('ripper worker crash transitions download to error in UI', async () => {
    await TestSeed.library.matrix()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:crash:1',
      status: 'downloading',
      progress: 0.2,
    })

    const { queryClient } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      status: 'error',
      error_at: new Date(),
    })

    await waitForDownloadProgressStream(queryClient)

    await DownloadEvents.publish(downloadId)

    await flush()

    await waitFor(
      () => {
        expect(query('download-pill', { nav: 'desktop' })).toBeNull()
      },
      { timeout: 5000 }
    )
  })

  test('season pack mixed states shows a row per download with its state', async () => {
    const media = await TestSeed.library.breakingBad()

    const { downloadId: dlDownloading } = await seedRipperDownload({
      mediaId: media.id,
      sourceId: 'ripper:mixed:1',
      status: 'downloading',
      progress: 0.5,
      seasonNumber: 1,
      episodeNumber: 1,
    })

    const { downloadId: dlError } = await seedRipperDownload({
      mediaId: media.id,
      sourceId: 'ripper:mixed:2',
      status: 'error',
      progress: 0,
      seasonNumber: 1,
      episodeNumber: 2,
    })

    const { downloadId: dlQueued } = await seedRipperDownload({
      mediaId: media.id,
      sourceId: 'ripper:mixed:3',
      status: 'completed',
      progress: 1,
      seasonNumber: 1,
      episodeNumber: 3,
    })

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        expect(
          get('library-release-row', { 'release-id': String(dlDownloading) })
            .dataset.state
        ).toBe('downloading')
        expect(
          get('library-release-row', { 'release-id': String(dlError) }).dataset
            .state
        ).toBe('error')
        expect(
          get('library-release-row', { 'release-id': String(dlQueued) }).dataset
            .state
        ).toBe('queued')
      },
      { timeout: 5000 }
    )
  })
})
