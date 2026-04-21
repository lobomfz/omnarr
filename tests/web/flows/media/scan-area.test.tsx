import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/tmdb'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { QueryClient } from '@tanstack/react-query'

import { PubSub } from '@/api/pubsub'
import { DbEvents } from '@/db/events'
import { DbMediaFiles } from '@/db/media-files'
import { scanQueue } from '@/jobs/queues'
import { orpcWs } from '@/web/client'

import { TestSeed } from '../../../helpers/seed'
import { get, query, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { act, cleanup, waitFor } from '../../testing-library'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(async () => {
  await cleanup()
})

async function waitForScanProgressStream(queryClient: QueryClient) {
  await waitFor(
    () => {
      if (
        queryClient.getQueryData(
          orpcWs.scanProgress.experimental_streamedOptions({}).queryKey
        ) === undefined
      ) {
        throw new Error('scan progress stream not ready')
      }
    },
    { timeout: 5000 }
  )
}

async function flush() {
  await act(() => Bun.sleep(1))
}

describe('scan area', () => {
  test('renders idle state when media has completed downloads', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        const area = get('scan-area', { state: 'idle' })
        const button = slot(area, 'scan-button') as HTMLButtonElement

        expect(button.disabled).toBe(false)
      },
      { timeout: 5000 }
    )
  })

  test('button disabled when no completed downloads', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.torrent({
      mediaId: media.id,
      sourceId: 'matrix-dl',
      status: 'downloading',
    })

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        const area = get('scan-area')
        const button = slot(area, 'scan-button') as HTMLButtonElement

        expect(button.disabled).toBe(true)
      },
      { timeout: 5000 }
    )
  })

  test('triggers rescan when clicked', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      const jobs = scanQueue.getJobs()
      const scanJob = jobs.find((j) => j.data.media_id === media.id)

      expect(scanJob).toBeDefined()
    })
  })

  test('transitions to pending after clicking scan', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      const area = get('scan-area', { state: 'pending' })
      const button = slot(area, 'scan-button') as HTMLButtonElement

      expect(button.disabled).toBe(true)
    })
  })

  test('pending clears when scan_progress WS event arrives', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      get('scan-area', { state: 'pending' })
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 1,
      total: 3,
      path: '/downloads/movie.mkv',
    })

    await flush()

    await waitFor(() => {
      expect(query('scan-area', { state: 'pending' })).toBeNull()
    })
  }, 10_000)

  test('shows error and returns to idle after timeout with no WS event', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      get('scan-area', { state: 'pending' })
    })

    await waitFor(
      () => {
        get('scan-area', { state: 'error' })
      },
      { timeout: 15_000 }
    )

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )
  }, 20_000)

  test('shows scanning state with progress attributes during scan', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      get('scan-area', { state: 'pending' })
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 1,
      total: 3,
      path: '/downloads/movie.mkv',
    })

    await flush()

    await waitFor(() => {
      const area = get('scan-area', { state: 'scanning' })

      expect(area.dataset.current).toBe('1')
      expect(area.dataset.total).toBe('3')
      expect(area.dataset.path).toBe('/downloads/movie.mkv')
    })
  }, 10_000)

  test('keeps scan progress visible after remounting during an active scan', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      get('scan-area', { state: 'pending' })
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 1,
      total: 3,
      path: '/downloads/movie.mkv',
    })

    await flush()

    await waitFor(() => {
      const area = get('scan-area', { state: 'scanning' })

      get('scan-progress')

      expect(area.dataset.current).toBe('1')
      expect(area.dataset.total).toBe('3')
      expect(area.dataset.path).toBe('/downloads/movie.mkv')
    })

    await TestSeed.player.downloadWithTracks(
      media.id,
      'done-release',
      '/downloads/movie-done.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          scan_ratio: 1,
        },
      ]
    )

    await TestSeed.player.downloadWithTracks(
      media.id,
      'active-release',
      '/downloads/movie.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          scan_ratio: 0.5,
        },
      ]
    )

    await TestSeed.player.downloadWithTracks(
      media.id,
      'queued-release',
      '/downloads/movie-queued.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'h264',
          is_default: true,
          scan_ratio: 0,
        },
      ]
    )

    await cleanup()

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        const area = get('scan-area')

        expect(area.dataset.state).toBe('probing')
        expect(area.dataset.current).toBe('1')
        expect(area.dataset.total).toBe('3')
        expect(area.dataset.path).toBe('/downloads/movie.mkv')

        get('scan-progress')
      },
      { timeout: 5000 }
    )
  }, 15_000)

  test('returns to idle on completion when current equals total', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      get('scan-area', { state: 'pending' })
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 1,
      total: 2,
      path: '/downloads/file1.mkv',
    })

    await flush()

    await waitFor(() => {
      get('scan-area', { state: 'scanning' })
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 2,
      total: 2,
      path: '/downloads/file2.mkv',
    })

    await flush()

    await waitFor(() => {
      get('scan-area', { state: 'idle' })
    })
  }, 10_000)

  test('returns to idle immediately on empty scan (0/0)', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      get('scan-area', { state: 'pending' })
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 0,
      total: 0,
      path: '',
    })

    await flush()

    await waitFor(() => {
      get('scan-area', { state: 'idle' })
    })
  }, 10_000)

  test('shows probing state with step and ratio alongside file-level context', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    await user.click(slot(get('scan-area'), 'scan-button'))

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 1,
      total: 2,
      path: '/downloads/movie.mkv',
    })

    await flush()

    await waitFor(() => {
      get('scan-area', { state: 'scanning' })
    })

    await PubSub.publish('scan_file_progress', {
      media_id: media.id,
      path: '/downloads/movie.mkv',
      current_step: 'keyframes',
      ratio: 0.5,
    })

    await flush()

    await waitFor(() => {
      const area = get('scan-area', { state: 'probing' })

      expect(area.dataset.current).toBe('1')
      expect(area.dataset.total).toBe('2')
      expect(area.dataset.path).toBe('/downloads/movie.mkv')
      expect(area.dataset.currentStep).toBe('keyframes')
      expect(area.dataset.ratio).toBe('0.5')
    })
  }, 10_000)

  test('transitions between keyframes and vad steps during probing', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    await user.click(slot(get('scan-area'), 'scan-button'))

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 1,
      total: 3,
      path: '/downloads/movie.mkv',
    })

    await flush()

    await PubSub.publish('scan_file_progress', {
      media_id: media.id,
      path: '/downloads/movie.mkv',
      current_step: 'keyframes',
      ratio: 0.3,
    })

    await flush()

    await waitFor(() => {
      const area = get('scan-area', { state: 'probing' })

      expect(area.dataset.currentStep).toBe('keyframes')
    })

    await PubSub.publish('scan_file_progress', {
      media_id: media.id,
      path: '/downloads/movie.mkv',
      current_step: 'vad',
      ratio: 0.7,
    })

    await flush()

    await waitFor(() => {
      const area = get('scan-area', { state: 'probing' })

      expect(area.dataset.currentStep).toBe('vad')
      expect(area.dataset.ratio).toBe('0.7')
    })
  }, 10_000)

  test('error banners appear for failed files after scan completion', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    expect(query('scan-error')).toBeNull()

    await user.click(slot(get('scan-area'), 'scan-button'))

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 1,
      total: 2,
      path: '/downloads/movie.mkv',
    })

    await flush()

    await DbEvents.create({
      media_id: media.id,
      entity_type: 'scan',
      entity_id: '/downloads/broken.mkv',
      event_type: 'file_error',
      message: 'Invalid data found when processing input',
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 2,
      total: 2,
      path: '/downloads/broken.mkv',
    })

    await PubSub.publish('scan_completed', { media_id: media.id })

    await flush()

    await waitFor(
      () => {
        get('scan-error')
      },
      { timeout: 5000 }
    )
  }, 10_000)

  test('rescanning clears previous error banners', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    await DbEvents.create({
      media_id: media.id,
      entity_type: 'scan',
      entity_id: '/old/failed.mkv',
      event_type: 'file_error',
      message: 'old error',
    })

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-error')
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      const jobs = scanQueue.getJobs()

      expect(jobs.find((j) => j.data.media_id === media.id)).toBeDefined()
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 0,
      total: 0,
      path: '',
    })

    await PubSub.publish('scan_completed', { media_id: media.id })

    await flush()

    await waitFor(
      () => {
        expect(query('scan-error')).toBeNull()
      },
      { timeout: 5000 }
    )
  }, 10_000)

  test('full cycle: idle → pending → scanning → probing → idle with data refresh', async () => {
    const media = await TestSeed.library.matrix()
    const download = await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    expect(query('file-row')).toBeNull()

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      get('scan-area', { state: 'pending' })
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 1,
      total: 2,
      path: '/downloads/movie.mkv',
    })

    await flush()

    await waitFor(() => {
      get('scan-area', { state: 'scanning' })
    })

    await PubSub.publish('scan_file_progress', {
      media_id: media.id,
      path: '/downloads/movie.mkv',
      current_step: 'keyframes',
      ratio: 0.4,
    })

    await flush()

    await waitFor(() => {
      const area = get('scan-area', { state: 'probing' })

      expect(area.dataset.currentStep).toBe('keyframes')
      expect(area.dataset.ratio).toBe('0.4')
    })

    await PubSub.publish('scan_file_progress', {
      media_id: media.id,
      path: '/downloads/movie.mkv',
      current_step: 'vad',
      ratio: 0.9,
    })

    await flush()

    await waitFor(() => {
      const area = get('scan-area', { state: 'probing' })

      expect(area.dataset.currentStep).toBe('vad')
    })

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 2,
      total: 2,
      path: '/downloads/movie2.mkv',
    })

    await PubSub.publish('scan_completed', { media_id: media.id })

    await flush()

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
        get('file-row')
      },
      { timeout: 5000 }
    )
  }, 15_000)

  test('button disabled throughout active scan', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    const button = () =>
      slot(get('scan-area'), 'scan-button') as HTMLButtonElement

    expect(button().disabled).toBe(false)

    await user.click(button())

    await waitFor(() => {
      get('scan-area', { state: 'pending' })
      expect(button().disabled).toBe(true)
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 1,
      total: 2,
      path: '/downloads/movie.mkv',
    })

    await flush()

    await waitFor(() => {
      get('scan-area', { state: 'scanning' })
      expect(button().disabled).toBe(true)
    })

    await PubSub.publish('scan_file_progress', {
      media_id: media.id,
      path: '/downloads/movie.mkv',
      current_step: 'keyframes',
      ratio: 0.5,
    })

    await flush()

    await waitFor(() => {
      get('scan-area', { state: 'probing' })
      expect(button().disabled).toBe(true)
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 2,
      total: 2,
      path: '/downloads/movie2.mkv',
    })

    await flush()

    await waitFor(() => {
      get('scan-area', { state: 'idle' })
      expect(button().disabled).toBe(false)
    })
  }, 15_000)

  test('download groups update with new files after scan completion', async () => {
    const media = await TestSeed.library.matrix()
    const download = await TestSeed.downloads.completed(media.id)

    const { user, queryClient } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('scan-area', { state: 'idle' })
      },
      { timeout: 5000 }
    )

    await waitForScanProgressStream(queryClient)

    expect(query('file-row')).toBeNull()

    await DbMediaFiles.create({
      media_id: media.id,
      download_id: download.id,
      path: '/movies/The.Matrix.1999.mkv',
      size: 8_000_000_000,
    })

    await user.click(slot(get('scan-area'), 'scan-button'))

    await waitFor(() => {
      get('scan-area', { state: 'pending' })
    })

    await PubSub.publish('scan_progress', {
      media_id: media.id,
      current: 1,
      total: 1,
      path: '/movies/The.Matrix.1999.mkv',
    })

    await PubSub.publish('scan_completed', { media_id: media.id })

    await flush()

    await waitFor(
      () => {
        get('file-row')
      },
      { timeout: 5000 }
    )
  }, 10_000)
})
