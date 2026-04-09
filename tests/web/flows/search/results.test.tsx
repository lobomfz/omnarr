import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/tmdb'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { TestSeed } from '../../../helpers/seed'
import { get, query, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, waitFor } from '../../testing-library'
import { typeSearch } from './helpers'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(async () => {
  await cleanup()
})

describe('search empty states', () => {
  test('shows prompt message when no query is typed', async () => {
    mountApp('/search')

    await waitFor(() => {
      get('search-prompt')
    })
  })

  test('shows no-results state when query matches nothing', async () => {
    const { user } = mountApp('/search')

    await waitFor(() => {
      get('search-prompt')
    })

    await typeSearch(user, 'xyznotfound')

    await waitFor(
      () => {
        expect(get('search-no-results').dataset.query).toBe('xyznotfound')
      },
      { timeout: 5000 }
    )
  })
})

describe('search results rendering', () => {
  test('fewer than 3 characters does not trigger search', async () => {
    const { user } = mountApp('/search')

    await waitFor(() => {
      get('search-prompt')
    })

    await typeSearch(user, 'Ma')

    await waitFor(() => {
      get('search-prompt')
    })

    expect(query('best-match')).toBeNull()
  })

  test('best match displays title, media type, year, and overview', async () => {
    const { user } = mountApp('/search')

    await waitFor(() => {
      get('search-prompt')
    })

    await typeSearch(user, 'Matrix')

    await waitFor(
      () => {
        const match = get('best-match')

        expect(match.dataset.title).toBe('The Matrix')
        expect(match.dataset.mediaType).toBe('movie')
        expect(match.dataset.year).toBe('1999')
        slot(match, 'overview')
      },
      { timeout: 5000 }
    )
  })

  test('single result shows best match without carousel', async () => {
    const { user } = mountApp('/search')

    await waitFor(() => {
      get('search-prompt')
    })

    await typeSearch(user, 'Matrix')

    await waitFor(
      () => {
        get('best-match')
      },
      { timeout: 5000 }
    )

    expect(query('results-carousel')).toBeNull()
  })

  test('multiple results show carousel below best match', async () => {
    const { user } = mountApp('/search')

    await waitFor(() => {
      get('search-prompt')
    })

    await typeSearch(user, 'Test')

    await waitFor(
      () => {
        get('best-match')
        get('results-carousel')
      },
      { timeout: 5000 }
    )
  })
})
