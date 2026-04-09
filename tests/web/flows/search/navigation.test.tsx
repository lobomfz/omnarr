import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/tmdb'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { deriveId } from '@/lib/utils'

import { TestSeed } from '../../../helpers/seed'
import { get, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, waitFor } from '../../testing-library'
import { typeSearch } from './helpers'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(async () => {
  await cleanup()
})

describe('library badge and navigation', () => {
  test('non-library best match has no badge and Open navigates to /search/$id', async () => {
    const matrixId = deriveId('603:movie')
    const { user, router } = mountApp('/search')

    await waitFor(() => {
      get('search-prompt')
    })

    await typeSearch(user, 'Matrix')

    await waitFor(
      () => {
        expect(get('best-match').dataset.inLibrary).toBe('false')
      },
      { timeout: 5000 }
    )

    await user.click(slot(get('best-match'), 'open'))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/search/${matrixId}`)
    })
  })

  test('library best match has badge and Open navigates to /media/$id', async () => {
    await TestSeed.library.matrix()
    const matrixId = deriveId('603:movie')
    const { user, router } = mountApp('/search')

    await waitFor(() => {
      get('search-prompt')
    })

    await typeSearch(user, 'Matrix')

    await waitFor(
      () => {
        expect(get('best-match').dataset.inLibrary).toBe('true')
      },
      { timeout: 5000 }
    )

    await user.click(slot(get('best-match'), 'open'))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/media/${matrixId}`)
    })
  })

  test('non-library carousel item has no badge and click navigates to /search/$id', async () => {
    await TestSeed.library.movie({
      tmdbId: 9998,
      title: 'Indexer Fail Test',
      year: 2020,
      imdbId: 'tt0000003',
    })
    const nonLibraryId = deriveId('10001:movie')

    const { user, router } = mountApp('/search')

    await waitFor(() => {
      get('search-prompt')
    })

    await typeSearch(user, 'Test')

    await waitFor(
      () => {
        expect(
          get('carousel-item', { 'media-id': nonLibraryId }).dataset.inLibrary
        ).toBe('false')
      },
      { timeout: 5000 }
    )

    await user.click(get('carousel-item', { 'media-id': nonLibraryId }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/search/${nonLibraryId}`)
    })
  })

  test('library carousel item has badge and click navigates to /media/$id', async () => {
    await TestSeed.library.movie({
      tmdbId: 10001,
      title: 'Ripper Fail Test',
      year: 2020,
      imdbId: 'tt0000001',
    })
    const libraryId = deriveId('10001:movie')

    const { user, router } = mountApp('/search')

    await waitFor(() => {
      get('search-prompt')
    })

    await typeSearch(user, 'Test')

    await waitFor(
      () => {
        expect(
          get('carousel-item', { 'media-id': libraryId }).dataset.inLibrary
        ).toBe('true')
      },
      { timeout: 5000 }
    )

    await user.click(get('carousel-item', { 'media-id': libraryId }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/media/${libraryId}`)
    })
  })
})
