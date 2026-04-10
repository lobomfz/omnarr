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

import { ripperQueue } from '@/jobs/queues'
import { deriveId } from '@/lib/utils'

import { TestSeed } from '../../../helpers/seed'
import { get, query } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, waitFor } from '../../testing-library'
import { seedDownload, seedRipperDownload } from './helpers'

beforeEach(() => {
  TestSeed.reset()
  ripperQueue.clear()
})

setDefaultTimeout(10_000)

afterEach(async () => {
  await cleanup()
})

describe('cross-cutting navigation and mixed sources', () => {
  test('navigation away and back preserves current progress display', async () => {
    await TestSeed.library.matrix()
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
        expect(get('download-group').dataset.status).toBe('downloading')
      },
      { timeout: 5000 }
    )

    await router.navigate({ to: '/' })

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/')
        expect(query('media-hero')).toBeNull()
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
        expect(query('media-hero')).not.toBeNull()
      },
      { timeout: 5000 }
    )

    expect(get('download-group').dataset.status).toBe('downloading')
  })

  test('clicking pill popover entry navigates to media detail and closes popover', async () => {
    await TestSeed.library.matrix()
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
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 5000 }
    )

    await user.click(get('download-pill', { nav: 'desktop' }))

    await waitFor(
      () => {
        get('pill-entry', { 'media-id': mediaId })
      },
      { timeout: 3000 }
    )

    await user.click(get('pill-entry', { 'media-id': mediaId }))

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe(`/media/${mediaId}`)
      },
      { timeout: 3000 }
    )

    await waitFor(
      () => {
        expect(query('pill-entry', { 'media-id': mediaId })).toBeNull()
      },
      { timeout: 3000 }
    )
  })

  test('torrent and ripper downloads are both displayed in pill', async () => {
    const matrixMediaId = deriveId('603:movie')

    await seedDownload({
      tmdbId: 603,
      title: 'The Matrix',
      sourceId: 'ABC123',
      progress: 0.4,
    })

    const bb = await TestSeed.library.breakingBad()
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
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('2')
      },
      { timeout: 5000 }
    )

    await user.click(get('download-pill', { nav: 'desktop' }))

    await waitFor(
      () => {
        get('pill-entry', { 'media-id': matrixMediaId })
        get('pill-entry', { 'media-id': bb.id })
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

    const bb = await TestSeed.library.breakingBad()

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
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('2')
      },
      { timeout: 5000 }
    )
  })
})
