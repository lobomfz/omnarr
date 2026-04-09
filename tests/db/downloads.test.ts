import { beforeEach, describe, expect, test } from 'bun:test'

import dayjs from 'dayjs'

import { db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

describe('deleteStaleErrors', () => {
  test('deletes error downloads older than 24 hours', async () => {
    const media = await TestSeed.library.matrix()

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'STALE_HASH',
      download_url: 'magnet:?xt=urn:btih:stale',
      status: 'error',
      error_at: dayjs().subtract(25, 'hours').toISOString(),
    })

    const deleted = await DbDownloads.deleteStaleErrors()

    expect(deleted).toBe(1)

    const remaining = await db.selectFrom('downloads').selectAll().execute()

    expect(remaining).toHaveLength(0)
  })

  test('keeps recent error downloads', async () => {
    const media = await TestSeed.library.matrix()

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'RECENT_HASH',
      download_url: 'magnet:?xt=urn:btih:recent',
      status: 'error',
      error_at: dayjs().subtract(1, 'hour').toISOString(),
    })

    const deleted = await DbDownloads.deleteStaleErrors()

    expect(deleted).toBe(0)

    const remaining = await db.selectFrom('downloads').selectAll().execute()

    expect(remaining).toHaveLength(1)
  })

  test('keeps non-error downloads regardless of age', async () => {
    const media = await TestSeed.library.matrix()

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'COMPLETED_HASH',
      download_url: 'magnet:?xt=urn:btih:completed',
      status: 'completed',
    })

    const deleted = await DbDownloads.deleteStaleErrors()

    expect(deleted).toBe(0)
  })

  test('deletes only stale errors in mixed set', async () => {
    const media = await TestSeed.library.matrix()

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'STALE_1',
      download_url: 'magnet:?xt=urn:btih:stale1',
      status: 'error',
      error_at: dayjs().subtract(48, 'hours').toISOString(),
    })

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'RECENT_1',
      download_url: 'magnet:?xt=urn:btih:recent1',
      status: 'error',
      error_at: dayjs().subtract(1, 'hour').toISOString(),
    })

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'ACTIVE_1',
      download_url: 'magnet:?xt=urn:btih:active1',
      status: 'downloading',
    })

    const deleted = await DbDownloads.deleteStaleErrors()

    expect(deleted).toBe(1)

    const remaining = await db
      .selectFrom('downloads')
      .select('source_id')
      .orderBy('source_id')
      .execute()

    expect(remaining).toHaveLength(2)
    expect(remaining.map((r) => r.source_id)).toEqual(['ACTIVE_1', 'RECENT_1'])
  })
})
