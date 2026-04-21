import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/tmdb'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { playerSession } from '@/player/player-session'

import { TestSeed } from '../../../helpers/seed'
import { get, query, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, fireEvent, waitFor } from '../../testing-library'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(async () => {
  await playerSession.stop()
  await cleanup()
})

async function mountPlayer() {
  const seed = await TestSeed.player.movieWithTracks()
  const app = mountApp(
    `/media/${seed.media.id}/play?video=${seed.video.id}&audio=${seed.audio.id}`
  )

  await waitFor(
    () => {
      get('video-player')
    },
    { timeout: 5000 }
  )

  return { ...seed, ...app }
}

function getVideoElement() {
  return slot(get('video-player'), 'video') as HTMLVideoElement
}

describe('video player', () => {
  test('renders video element after player starts', async () => {
    await mountPlayer()

    const video = getVideoElement()

    expect(video.tagName).toBe('VIDEO')
  })

  test('renders all control elements', async () => {
    await mountPlayer()

    const player = get('video-player')

    slot(player, 'play-pause')
    slot(player, 'seek-bar')
    slot(player, 'volume-slider')
    slot(player, 'mute-toggle')
    slot(player, 'fullscreen-toggle')
    slot(player, 'back-button')
  })

  test('play-pause toggles playing state', async () => {
    const { user } = await mountPlayer()

    expect(get('video-player').dataset.playing).toBe('false')

    const video = getVideoElement()

    await user.click(slot(get('video-player'), 'play-pause'))
    fireEvent(video, new Event('play'))

    await waitFor(() => {
      expect(get('video-player').dataset.playing).toBe('true')
    })

    await user.click(slot(get('video-player'), 'play-pause'))
    fireEvent(video, new Event('pause'))

    await waitFor(() => {
      expect(get('video-player').dataset.playing).toBe('false')
    })
  })

  test('mute toggle changes muted state', async () => {
    const { user } = await mountPlayer()

    const video = getVideoElement()

    expect(get('video-player').dataset.muted).toBe('true')

    await user.click(slot(get('video-player'), 'mute-toggle'))
    fireEvent(video, new Event('volumechange'))

    await waitFor(() => {
      expect(get('video-player').dataset.muted).toBe('false')
    })

    await user.click(slot(get('video-player'), 'mute-toggle'))
    fireEvent(video, new Event('volumechange'))

    await waitFor(() => {
      expect(get('video-player').dataset.muted).toBe('true')
    })
  })

  test('shows buffering indicator when video is waiting', async () => {
    await mountPlayer()

    const video = getVideoElement()

    fireEvent(video, new Event('waiting'))

    await waitFor(() => {
      expect(get('video-player').dataset.buffering).toBe('true')
    })

    fireEvent(video, new Event('playing'))

    await waitFor(() => {
      expect(get('video-player').dataset.buffering).toBe('false')
    })
  })

  test('back button navigates to media page', async () => {
    const { media, router } = await mountPlayer()

    const backBtn = slot(get('video-player'), 'back-button')

    fireEvent.click(backBtn)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/media/${media.id}`)
    })
  })

  test('starts muted and plays without unmute banner', async () => {
    const originalPlay = HTMLMediaElement.prototype.play

    HTMLMediaElement.prototype.play = function () {
      if (!this.muted) {
        return Promise.reject(new DOMException('', 'NotAllowedError'))
      }

      return Promise.resolve()
    }

    try {
      await mountPlayer()

      const video = getVideoElement()
      fireEvent(video, new Event('canplay'))

      await Bun.sleep(50)

      expect(get('video-player').dataset.muted).toBe('true')
      expect(query('unmute-indicator')).toBeNull()
    } finally {
      HTMLMediaElement.prototype.play = originalPlay
    }
  })
})

describe('auto-hide controls', () => {
  test('controls are visible initially', async () => {
    await mountPlayer()

    expect(get('video-player').dataset.controlsVisible).toBe('true')
  })

  test('controls hide after inactivity and reappear on mouse move', async () => {
    await mountPlayer()

    expect(get('video-player').dataset.controlsVisible).toBe('true')

    await waitFor(
      () => {
        expect(get('video-player').dataset.controlsVisible).toBe('false')
      },
      { timeout: 5000 }
    )

    fireEvent.mouseMove(get('video-player'))

    expect(get('video-player').dataset.controlsVisible).toBe('true')
  })

  test('cursor hides when controls are hidden', async () => {
    await mountPlayer()

    await waitFor(
      () => {
        expect(get('video-player').dataset.controlsVisible).toBe('false')
      },
      { timeout: 5000 }
    )

    expect(get('video-player').dataset.cursorHidden).toBe('true')
  })
})

describe('keyboard shortcuts', () => {
  test('Space toggles play/pause', async () => {
    await mountPlayer()

    const video = getVideoElement()

    fireEvent.keyDown(document, { key: ' ' })
    fireEvent(video, new Event('play'))

    await waitFor(() => {
      expect(get('video-player').dataset.playing).toBe('true')
    })

    fireEvent.keyDown(document, { key: ' ' })
    fireEvent(video, new Event('pause'))

    await waitFor(() => {
      expect(get('video-player').dataset.playing).toBe('false')
    })
  })

  test('ArrowLeft seeks backward by 10 seconds', async () => {
    await mountPlayer()

    const video = getVideoElement()
    video.currentTime = 30

    fireEvent.keyDown(document, { key: 'ArrowLeft' })

    expect(video.currentTime).toBe(20)
  })

  test('ArrowRight seeks forward by 10 seconds', async () => {
    await mountPlayer()

    const video = getVideoElement()
    video.currentTime = 10

    fireEvent.keyDown(document, { key: 'ArrowRight' })

    expect(video.currentTime).toBe(20)
  })

  test('ArrowLeft does not seek below zero', async () => {
    await mountPlayer()

    const video = getVideoElement()
    video.currentTime = 3

    fireEvent.keyDown(document, { key: 'ArrowLeft' })

    expect(video.currentTime).toBe(0)
  })

  test('M toggles mute', async () => {
    await mountPlayer()

    const video = getVideoElement()

    expect(get('video-player').dataset.muted).toBe('true')

    fireEvent.keyDown(document, { key: 'm' })
    fireEvent(video, new Event('volumechange'))

    await waitFor(() => {
      expect(get('video-player').dataset.muted).toBe('false')
    })

    fireEvent.keyDown(document, { key: 'm' })
    fireEvent(video, new Event('volumechange'))

    await waitFor(() => {
      expect(get('video-player').dataset.muted).toBe('true')
    })
  })

  test('F requests fullscreen', async () => {
    await mountPlayer()

    const container = get('video-player')
    let called = false
    container.requestFullscreen = () => {
      called = true

      return Promise.resolve()
    }

    fireEvent.keyDown(document, { key: 'f' })

    expect(called).toBe(true)
  })

  test('keyboard shortcuts reset auto-hide timer', async () => {
    await mountPlayer()

    await waitFor(
      () => {
        expect(get('video-player').dataset.controlsVisible).toBe('false')
      },
      { timeout: 5000 }
    )

    fireEvent.keyDown(document, { key: ' ' })

    expect(get('video-player').dataset.controlsVisible).toBe('true')
  })
})
