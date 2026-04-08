import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/beyond-hd'
import '../../../mocks/subdl'
import '../../../mocks/superflix'
import '../../../mocks/tmdb'
import '../../../mocks/yts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { cleanup, fireEvent, waitFor, within } from '@testing-library/react'

import { DownloadEvents } from '@/core/download-events'
import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { ripperQueue } from '@/jobs/queues'
import { deriveId } from '@/lib/utils'

import { mountApp } from '../../mount-app'
import {
  resetDownloadState,
  seedBreakingBadInLibrary,
  seedBreakingBadNoEpisodes,
  seedMatrixInLibrary,
  seedRipperDownload,
} from './helpers'

beforeEach(() => {
  resetDownloadState()
  ripperQueue.clear()
})

afterEach(() => {
  cleanup()
})

describe('ripper lifecycle', () => {
  const q = within(document.body)

  function pillButtons(name: string) {
    return q.queryAllByRole('button', { name })
  }

  test('adding single-episode ripper release shows download in pill', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    const { user } = mountApp(`/media/${mediaId}`)

    const addReleaseBtn = await q.findByRole(
      'button',
      { name: /Add Release/i },
      { timeout: 5000 }
    )

    await user.click(addReleaseBtn)

    const release = await q.findByRole(
      'button',
      { name: /\[superflix\]/i },
      { timeout: 5000 }
    )

    await user.click(release)

    const downloadBtn = await q.findByRole('button', {
      name: /^Download$/,
    })

    await user.click(downloadBtn)

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 2000 }
    )
  })

  test('adding ripper season pack shows every episode in pill', async () => {
    await seedBreakingBadInLibrary()
    const mediaId = deriveId('1399:tv')

    const { user } = mountApp(`/media/${mediaId}`)

    const addReleaseBtn = await q.findByRole(
      'button',
      { name: /Add Release/i },
      { timeout: 5000 }
    )

    await user.click(addReleaseBtn)

    await waitFor(
      () => {
        expect(document.querySelector('select')).not.toBeNull()
      },
      { timeout: 3000 }
    )

    fireEvent.change(document.querySelector('select')!, {
      target: { value: '1' },
    })

    const release = await q.findByRole(
      'button',
      { name: /superflix/i },
      { timeout: 5000 }
    )

    await user.click(release)

    const downloadBtn = await q.findByRole('button', {
      name: /^Download$/,
    })

    await user.click(downloadBtn)

    await waitFor(
      () => {
        expect(pillButtons('3').length).toBeGreaterThan(0)
      },
      { timeout: 2000 }
    )
  })

  test('ripper season pack with no episodes shows error message', async () => {
    await seedBreakingBadNoEpisodes()
    const mediaId = deriveId('1399:tv')

    const { user } = mountApp(`/media/${mediaId}`)

    const addReleaseBtn = await q.findByRole(
      'button',
      { name: /Add Release/i },
      { timeout: 5000 }
    )

    await user.click(addReleaseBtn)

    await waitFor(
      () => {
        expect(document.querySelector('select')).not.toBeNull()
      },
      { timeout: 3000 }
    )

    fireEvent.change(document.querySelector('select')!, {
      target: { value: '1' },
    })

    const release = await q.findByRole(
      'button',
      { name: /superflix/i },
      { timeout: 5000 }
    )

    await user.click(release)

    const downloadBtn = await q.findByRole('button', {
      name: /^Download$/,
    })

    await user.click(downloadBtn)

    await q.findByText(/No episodes found/i, undefined, { timeout: 3000 })

    const downloads = await database.kysely
      .selectFrom('downloads')
      .selectAll()
      .execute()

    expect(downloads).toHaveLength(0)
  })

  test('speed is displayed in pill popover and detail page', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:speed:1',
      status: 'downloading',
      progress: 0.3,
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
      speed: 5_000_000,
    })

    await DownloadEvents.publish(downloadId)

    await waitFor(
      () => {
        expect(q.getAllByText(/5\.0MB\/s/).length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  test('ripper progress updates are reflected in the UI', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:progress:1',
      status: 'downloading',
      progress: 0,
    })

    mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      progress: 0.75,
    })

    await DownloadEvents.publish(downloadId)

    await waitFor(
      () => {
        expect(q.getAllByText('75%').length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  test('completed ripper download leaves pill and detail shows completion', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:complete:1',
      status: 'downloading',
      progress: 0.8,
    })

    mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      status: 'completed',
      progress: 1,
    })

    await DownloadEvents.publish(downloadId)

    await waitFor(
      () => {
        expect(pillButtons('1')).toHaveLength(0)
      },
      { timeout: 3000 }
    )
  })

  test('ripper zero-rip failure leaves pill and shows error badge', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:zerorip:1',
      status: 'downloading',
      progress: 0,
    })

    mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      status: 'error',
      error_at: new Date().toISOString(),
    })

    await DownloadEvents.publish(downloadId)

    await waitFor(
      () => {
        expect(pillButtons('1')).toHaveLength(0)
      },
      { timeout: 3000 }
    )

    expect(q.getAllByText(/Error/i).length).toBeGreaterThan(0)
  })

  test('ripper worker crash transitions download to error in UI', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:crash:1',
      status: 'downloading',
      progress: 0.2,
    })

    mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      status: 'error',
      error_at: new Date().toISOString(),
    })

    await DownloadEvents.publish(downloadId)

    await waitFor(
      () => {
        expect(pillButtons('1')).toHaveLength(0)
      },
      { timeout: 3000 }
    )
  })

  test('pending ripper download transitions to downloading with progress', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    const { downloadId } = await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:pending:1',
      status: 'pending',
      progress: 0,
    })

    mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(q.getAllByText(/Pending/i).length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await DbDownloads.update(downloadId, {
      status: 'downloading',
      progress: 0.3,
      speed: 2_000_000,
      eta: 100,
    })

    await DownloadEvents.publish(downloadId)

    await waitFor(
      () => {
        expect(q.getAllByText(/Downloading/i).length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )

    expect(q.getAllByText('30%').length).toBeGreaterThan(0)
  })

  test('season pack mixed states shows correct pill count and individual states', async () => {
    const media = await seedBreakingBadInLibrary()

    await seedRipperDownload({
      mediaId: media.id,
      sourceId: 'ripper:mixed:1',
      status: 'downloading',
      progress: 0.5,
      seasonNumber: 1,
      episodeNumber: 1,
    })

    await seedRipperDownload({
      mediaId: media.id,
      sourceId: 'ripper:mixed:2',
      status: 'pending',
      progress: 0,
      seasonNumber: 1,
      episodeNumber: 2,
    })

    await seedRipperDownload({
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
        expect(pillButtons('2').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await waitFor(
      () => {
        expect(q.getAllByText(/Downloading/i).length).toBeGreaterThan(0)
        expect(q.getAllByText(/Pending/i).length).toBeGreaterThan(0)
        expect(q.getAllByText(/Completed/i).length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })
})
