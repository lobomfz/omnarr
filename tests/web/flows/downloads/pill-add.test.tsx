import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/beyond-hd'
import '../../../mocks/subdl'
import '../../../mocks/superflix'
import '../../../mocks/tmdb'
import '../../../mocks/yts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { cleanup, waitFor, within } from '@testing-library/react'

import { database } from '@/db/connection'
import { deriveId } from '@/lib/utils'

import { QBittorrentMock } from '../../../mocks/qbittorrent'
import { mountApp } from '../../mount-app'
import {
  resetDownloadState,
  seedMatrixInLibrary,
  seedMatrixSearchResult,
} from './helpers'

beforeEach(() => {
  resetDownloadState()
})

afterEach(() => {
  cleanup()
})

describe('downloads pill reactive state', () => {
  const q = within(document.body)

  function pillButtons(name: string) {
    return q.queryAllByRole('button', { name })
  }

  test('adding torrent for media not in library shows pill immediately', async () => {
    const searchId = await seedMatrixSearchResult()

    const { user } = mountApp(`/search/${searchId}`)

    const release = await q.findByRole(
      'button',
      { name: /The\.Matrix\.1999\.2160p/ },
      { timeout: 5000 }
    )

    await user.click(release)

    const downloadBtn = await q.findByRole('button', {
      name: /^Download$/,
    })

    await user.click(downloadBtn)

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 2000 }
    )
  })

  test('adding torrent for media already in library increments pill counter', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    const { user } = mountApp(`/media/${mediaId}`)

    const addReleaseBtn = await q.findByRole(
      'button',
      { name: /Add Release/i },
      { timeout: 5000 }
    )

    await user.click(addReleaseBtn)

    const release = await q.findByRole(
      'button',
      { name: /The\.Matrix\.1999\.2160p/ },
      { timeout: 5000 }
    )

    await user.click(release)

    const downloadBtn = await q.findByRole('button', {
      name: /^Download$/,
    })

    await user.click(downloadBtn)

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
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

    const searchId = await seedMatrixSearchResult()

    const { user } = mountApp(`/search/${searchId}`)

    const release = await q.findByRole(
      'button',
      { name: /The\.Matrix\.1999\.2160p/ },
      { timeout: 5000 }
    )

    await user.click(release)

    const downloadBtn = await q.findByRole('button', {
      name: /^Download$/,
    })

    await user.click(downloadBtn)

    await q.findByText(/Torrent rejected/i, undefined, { timeout: 2000 })

    expect(pillButtons('1')).toHaveLength(0)

    const mediaRows = await database.kysely
      .selectFrom('media')
      .selectAll()
      .execute()
    expect(mediaRows).toHaveLength(0)
  })

  test('adding two releases in quick succession shows both in pill', async () => {
    await seedMatrixInLibrary()
    const mediaId = deriveId('603:movie')

    const { user } = mountApp(`/media/${mediaId}`)

    const addReleaseBtn = await q.findByRole(
      'button',
      { name: /Add Release/i },
      { timeout: 5000 }
    )

    await user.click(addReleaseBtn)

    const release1 = await q.findByRole(
      'button',
      { name: /The\.Matrix\.1999\.2160p/ },
      { timeout: 5000 }
    )

    await user.click(release1)

    const downloadBtn1 = await q.findByRole('button', {
      name: /^Download$/,
    })

    await user.click(downloadBtn1)

    await waitFor(
      () => {
        expect(pillButtons('1').length).toBeGreaterThan(0)
      },
      { timeout: 2000 }
    )

    const release2 = q.getByRole('button', {
      name: /The\.Matrix\.1999\.1080p/,
    })

    await user.click(release2)

    const downloadBtn2 = await q.findByRole('button', {
      name: /^Download$/,
    })

    await user.click(downloadBtn2)

    await waitFor(
      () => {
        expect(pillButtons('2').length).toBeGreaterThan(0)
      },
      { timeout: 2000 }
    )
  })
})
