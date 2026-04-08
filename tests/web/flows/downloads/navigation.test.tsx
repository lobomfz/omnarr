import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/beyond-hd'
import '../../../mocks/subdl'
import '../../../mocks/superflix'
import '../../../mocks/tmdb'
import '../../../mocks/yts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { cleanup, waitFor, within } from '@testing-library/react'

import { ripperQueue } from '@/jobs/queues'
import { deriveId } from '@/lib/utils'

import { mountApp } from '../../mount-app'
import {
  resetDownloadState,
  seedBreakingBadInLibrary,
  seedDownload,
  seedMatrixInLibrary,
  seedMatrixSearchResult,
  seedRipperDownload,
} from './helpers'

beforeEach(() => {
  resetDownloadState()
  ripperQueue.clear()
})

afterEach(() => {
  cleanup()
})

describe('cross-cutting navigation and mixed sources', () => {
  const q = within(document.body)

  function pillButtons(name: string) {
    return q.queryAllByRole('button', { name })
  }

  test('navigation away and back preserves current progress display', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:nav:1',
      status: 'downloading',
      progress: 0.3,
    })

    const { router } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        expect(q.getAllByText('30%').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    await router.navigate({ to: '/' })

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/')
        expect(q.queryByRole('button', { name: /Add Release/i })).toBeNull()
      },
      { timeout: 3000 }
    )

    await router.navigate({
      to: '/media/$id',
      params: { id: mediaId },
    })

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe(`/media/${mediaId}`)
        expect(q.queryByRole('button', { name: /Add Release/i })).not.toBeNull()
      },
      { timeout: 5000 }
    )

    expect(q.getAllByText('30%').length).toBeGreaterThan(0)
  })

  test('download started on search page is reflected on detail page after navigation', async () => {
    const searchId = await seedMatrixSearchResult()
    const mediaId = deriveId('603:movie')

    const { user, router } = mountApp(`/search/${searchId}`)

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

    await q.findByText(/Download started/i, undefined, { timeout: 3000 })

    await router.navigate({
      to: '/media/$id',
      params: { id: mediaId },
    })

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe(`/media/${mediaId}`)
        expect(q.queryByRole('button', { name: /Add Release/i })).not.toBeNull()
      },
      { timeout: 5000 }
    )

    expect(q.getAllByText(/Downloading/i).length).toBeGreaterThan(0)
  })

  test('clicking pill popover entry navigates to media detail and closes popover', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    await seedRipperDownload({
      mediaId,
      sourceId: 'ripper:navclick:1',
      status: 'downloading',
      progress: 0.3,
    })

    const { user, router } = mountApp('/')

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    const countBefore = q.queryAllByRole('link', { name: /The Matrix/i }).length

    const pillBtn = pillButtons('1')[0]!
    await user.click(pillBtn)

    await waitFor(
      () => {
        expect(
          q.queryAllByRole('link', { name: /The Matrix/i }).length
        ).toBeGreaterThan(countBefore)
      },
      { timeout: 3000 }
    )

    const popoverLinks = q.queryAllByRole('link', { name: /The Matrix/i })
    const popoverEntry = popoverLinks.at(-1)!

    await user.click(popoverEntry)

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe(`/media/${mediaId}`)
      },
      { timeout: 3000 }
    )

    await waitFor(
      () => {
        expect(q.queryAllByRole('link', { name: /The Matrix/i })).toHaveLength(
          0
        )
      },
      { timeout: 3000 }
    )
  })

  test('torrent and ripper downloads are both displayed in pill', async () => {
    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
      progress: 0.4,
    })

    const bb = await seedBreakingBadInLibrary()
    await seedRipperDownload({
      mediaId: bb.id,
      sourceId: 'ripper:parallel:1',
      status: 'downloading',
      progress: 0.2,
      seasonNumber: 1,
      episodeNumber: 1,
    })

    const { user } = mountApp('/')

    await waitFor(
      () => {
        expect(pillButtons('2').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    const pillBtn = pillButtons('2')[0]!
    await user.click(pillBtn)

    await waitFor(
      () => {
        expect(q.getAllByText('The Matrix').length).toBeGreaterThanOrEqual(2)
        expect(q.getAllByText('Breaking Bad').length).toBeGreaterThanOrEqual(2)
      },
      { timeout: 3000 }
    )
  })

  test('pill aggregate reflects only active downloads across mixed states', async () => {
    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
      progress: 0.4,
      status: 'downloading',
    })

    const bb = await seedBreakingBadInLibrary()

    await seedRipperDownload({
      mediaId: bb.id,
      sourceId: 'ripper:mix:pending',
      status: 'pending',
      progress: 0,
      seasonNumber: 1,
      episodeNumber: 1,
    })

    await seedRipperDownload({
      mediaId: bb.id,
      sourceId: 'ripper:mix:done',
      status: 'completed',
      progress: 1,
      seasonNumber: 1,
      episodeNumber: 2,
    })

    mountApp('/')

    await waitFor(
      () => {
        expect(pillButtons('2').length).toBeGreaterThan(0)
      },
      { timeout: 5000 }
    )

    expect(pillButtons('3')).toHaveLength(0)
  })
})
