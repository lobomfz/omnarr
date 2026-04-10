import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/beyond-hd'
import '../../../mocks/subdl'
import '../../../mocks/superflix'
import '../../../mocks/tmdb'
import '../../../mocks/yts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { database } from '@/db/connection'
import { deriveId } from '@/lib/utils'

import { TestSeed } from '../../../helpers/seed'
import { QBittorrentMock } from '../../../mocks/qbittorrent'
import { get, query, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import type { UserEvent } from '../../testing-library'
import { cleanup, waitFor } from '../../testing-library'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(async () => {
  await cleanup()
})

async function selectReleaseAndDownload(user: UserEvent, sourceId: string) {
  await waitFor(
    () => {
      get('release-row', { 'source-id': sourceId })
    },
    { timeout: 5000 }
  )

  await user.click(get('release-row', { 'source-id': sourceId }))

  await waitFor(() => {
    slot(get('action-bar'), 'download')
  })

  await user.click(slot(get('action-bar'), 'download'))
}

describe('downloads pill reactive state', () => {
  test('adding torrent for media not in library shows pill immediately', async () => {
    await TestSeed.search.matrix()
    const mediaId = deriveId('603:movie')

    const { user } = mountApp(`/media/${mediaId}`)

    await selectReleaseAndDownload(user, 'ABC123')

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 2000 }
    )
  })

  test('adding torrent for media already in library increments pill counter', async () => {
    await TestSeed.library.matrix()
    const mediaId = deriveId('603:movie')

    const { user } = mountApp(`/media/${mediaId}`)

    await selectReleaseAndDownload(user, 'ABC123')

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 2000 }
    )
  })

  test('adding torrent when qBittorrent rejects shows error without phantom entries', async () => {
    await QBittorrentMock.db
      .insertInto('torrents')
      .values({
        hash: 'abc123',
        url: 'https://beyond-hd.me/dl/abc123',
        savepath: '',
        category: 'omnarr',
        progress: 0,
        dlspeed: 0,
        eta: 0,
        state: 'downloading',
        content_path: '/abc123',
      })
      .execute()

    await TestSeed.search.matrix()
    const mediaId = deriveId('603:movie')

    const { user } = mountApp(`/media/${mediaId}`)

    await selectReleaseAndDownload(user, 'ABC123')

    await waitFor(
      () => {
        expect(get('toast').dataset.code).toBe('TORRENT_REJECTED')
      },
      { timeout: 2000 }
    )

    expect(query('download-pill', { nav: 'desktop' })).toBeNull()

    const mediaRows = await database.kysely
      .selectFrom('media')
      .selectAll()
      .execute()
    expect(mediaRows).toHaveLength(0)
  })

  test('adding two releases in quick succession shows both in pill', async () => {
    await TestSeed.library.matrix()
    const mediaId = deriveId('603:movie')

    const { user } = mountApp(`/media/${mediaId}`)

    await selectReleaseAndDownload(user, 'ABC123')

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('1')
      },
      { timeout: 2000 }
    )

    await user.click(get('release-row', { 'source-id': 'DEF456' }))

    await user.click(slot(get('action-bar'), 'download'))

    await waitFor(
      () => {
        expect(get('download-pill', { nav: 'desktop' }).dataset.count).toBe('2')
      },
      { timeout: 2000 }
    )
  })
})
