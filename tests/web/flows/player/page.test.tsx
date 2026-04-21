import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/tmdb'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { playerSession } from '@/player/player-session'

import { TestSeed } from '../../../helpers/seed'
import { get } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, waitFor } from '../../testing-library'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(async () => {
  await playerSession.stop()
  await cleanup()
})

describe('player page', () => {
  test('calls player.start on mount and renders video player', async () => {
    const { media, video, audio } = await TestSeed.player.movieWithTracks()

    mountApp(`/media/${media.id}/play?video=${video.id}&audio=${audio.id}`)

    await waitFor(
      () => {
        get('video-player')
      },
      { timeout: 5000 }
    )

    expect(playerSession.active).toBe(true)
  })

  test('calls player.stop when navigating away', async () => {
    const { media, video, audio } = await TestSeed.player.movieWithTracks()

    const { router } = mountApp(
      `/media/${media.id}/play?video=${video.id}&audio=${audio.id}`
    )

    await waitFor(
      () => {
        get('video-player')
        expect(playerSession.active).toBe(true)
      },
      { timeout: 5000 }
    )

    router.navigate({ to: '/' })

    await waitFor(() => {
      expect(playerSession.active).toBe(false)
    })
  })
})
