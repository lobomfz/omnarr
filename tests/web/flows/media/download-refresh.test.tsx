import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/beyond-hd'
import '../../../mocks/tmdb'
import '../../../mocks/yts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { deriveId } from '@/lib/utils'

import { TestSeed } from '../../../helpers/seed'
import { get, query, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, waitFor } from '../../testing-library'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(() => cleanup())

describe('media page after adding download', () => {
  test('downloads section appears without manual refresh', async () => {
    await TestSeed.search.matrix()
    const mediaId = deriveId('603:movie')

    const { user } = mountApp(`/media/${mediaId}`)

    await waitFor(
      () => {
        get('release-row', { 'source-id': 'ABC123' })
      },
      { timeout: 5000 }
    )

    await user.click(get('release-row', { 'source-id': 'ABC123' }))

    await waitFor(() => {
      slot(get('action-bar'), 'download')
    })

    await user.click(slot(get('action-bar'), 'download'))

    await waitFor(
      () => {
        expect(query('library-release-row')).not.toBeNull()
      },
      { timeout: 5000 }
    )
  })
})
