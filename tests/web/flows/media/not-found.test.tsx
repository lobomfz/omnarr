import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/tmdb'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { TestSeed } from '../../../helpers/seed'
import { get, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, waitFor } from '../../testing-library'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(() => cleanup())

describe('media page with non-existent ID', () => {
  test('shows not-found state instead of crashing', async () => {
    mountApp('/media/TESTID')

    await waitFor(
      () => {
        get('media-not-found')
      },
      { timeout: 5000 }
    )
  })

  test('clicking go back returns to previous route', async () => {
    const { user, router } = mountApp('/search')

    await waitFor(
      () => {
        get('search-page')
      },
      { timeout: 5000 }
    )

    await router.navigate({ to: '/media/$id', params: { id: 'TESTID' } })

    await waitFor(
      () => {
        get('media-not-found')
      },
      { timeout: 5000 }
    )

    await user.click(slot(get('media-not-found'), 'go-back'))

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/search')
      },
      { timeout: 3000 }
    )
  })
})
