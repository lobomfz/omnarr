import '../../setup-dom'
import '../../../helpers/api-server'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { TestSeed } from '../../../helpers/seed'
import { get, query, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, waitFor } from '../../testing-library'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(async () => {
  await cleanup()
})

describe('hero spotlight', () => {
  test('does not render when library is empty', async () => {
    mountApp('/')

    await waitFor(() => {
      get('empty-state')
    })

    expect(query('hero-spotlight')).toBeNull()
  })

  test('renders title and media link for a library item with backdrop', async () => {
    await TestSeed.library.matrix({
      backdropPath: '/backdrop.jpg',
      overview: 'A computer hacker learns about the true nature of reality.',
    })

    mountApp('/')

    await waitFor(
      () => {
        const spotlight = get('hero-spotlight')

        expect(spotlight.dataset.title).toBe('The Matrix')
        expect(spotlight.dataset.mediaId).toBeDefined()
        slot(spotlight, 'details-link')
      },
      { timeout: 5000 }
    )
  })

  test('renders overview when present', async () => {
    await TestSeed.library.matrix({
      backdropPath: '/backdrop.jpg',
      overview: 'A computer hacker learns about the true nature of reality.',
    })

    mountApp('/')

    await waitFor(
      () => {
        const spotlight = get('hero-spotlight')

        slot(spotlight, 'overview')
      },
      { timeout: 5000 }
    )
  })

  test('omits overview slot when overview is null', async () => {
    await TestSeed.library.matrix({
      backdropPath: '/backdrop.jpg',
    })

    mountApp('/')

    await waitFor(
      () => {
        const spotlight = get('hero-spotlight')

        expect(spotlight.querySelector('[data-slot="overview"]')).toBeNull()
      },
      { timeout: 5000 }
    )
  })

  test('details link points to the media page', async () => {
    const media = await TestSeed.library.matrix({
      backdropPath: '/backdrop.jpg',
    })

    mountApp('/')

    await waitFor(
      () => {
        const spotlight = get('hero-spotlight')
        const link = slot(spotlight, 'details-link') as HTMLAnchorElement

        expect(link.getAttribute('href')).toBe(`/media/${media.id}`)
      },
      { timeout: 5000 }
    )
  })
})
