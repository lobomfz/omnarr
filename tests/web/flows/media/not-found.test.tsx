import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/tmdb'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { TestSeed } from '../../../helpers/seed'
import { get } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, waitFor } from '../../testing-library'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(async () => {
  await cleanup()
})

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
})
