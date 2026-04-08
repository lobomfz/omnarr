import { beforeEach, describe, expect, test } from 'bun:test'

import { database } from '@/db/connection'
import { DbEvents } from '@/db/events'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/lib/utils'

beforeEach(() => {
  database.reset()
})

async function seedMedia() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    imdb_id: 'tt0133093',
    year: 1999,
  })

  return await DbMedia.create({
    id: deriveId('603:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/movies',
  })
}

describe('DbEvents.create', () => {
  test('creates an event with all fields', async () => {
    const media = await seedMedia()

    const event = await DbEvents.create({
      media_id: media.id,
      entity_type: 'download',
      entity_id: 'HASH123',
      event_type: 'created',
      message: 'Download started: The Matrix',
    })

    expect(event.id).toBeGreaterThan(0)
    expect(event.media_id).toBe(media.id)
    expect(event.entity_type).toBe('download')
    expect(event.entity_id).toBe('HASH123')
    expect(event.event_type).toBe('created')
    expect(event.message).toBe('Download started: The Matrix')
    expect(event.read).toBe(false)
  })

  test('creates an event without media_id', async () => {
    const event = await DbEvents.create({
      entity_type: 'sync',
      entity_id: 'qbittorrent',
      event_type: 'error',
      message: 'qBittorrent unreachable',
    })

    expect(event.id).toBeGreaterThan(0)
    expect(event.media_id).toBeNull()
  })

  test('creates an event with metadata', async () => {
    const media = await seedMedia()

    const event = await DbEvents.create({
      media_id: media.id,
      entity_type: 'scan',
      entity_id: 'file123',
      event_type: 'file_error',
      message: 'Probe failed',
      metadata: JSON.stringify({ path: '/movies/file.mkv' }),
    })

    expect(event.metadata).not.toBeNull()
  })
})

describe('DbEvents.getByMediaId', () => {
  test('returns events for a media ordered by id desc', async () => {
    const media = await seedMedia()

    await DbEvents.create({
      media_id: media.id,
      entity_type: 'download',
      entity_id: 'HASH1',
      event_type: 'created',
      message: 'first',
    })

    await DbEvents.create({
      media_id: media.id,
      entity_type: 'download',
      entity_id: 'HASH1',
      event_type: 'completed',
      message: 'second',
    })

    const events = await DbEvents.getByMediaId(media.id)

    expect(events).toHaveLength(2)
    expect(events[0].message).toBe('second')
    expect(events[1].message).toBe('first')
  })

  test('returns empty array when no events exist', async () => {
    const events = await DbEvents.getByMediaId('NONEXISTENT')

    expect(events).toHaveLength(0)
  })
})

describe('DbEvents.markRead', () => {
  test('marks specified events as read', async () => {
    const media = await seedMedia()

    const e1 = await DbEvents.create({
      media_id: media.id,
      entity_type: 'download',
      entity_id: 'HASH1',
      event_type: 'error',
      message: 'event 1',
    })

    const e2 = await DbEvents.create({
      media_id: media.id,
      entity_type: 'download',
      entity_id: 'HASH2',
      event_type: 'error',
      message: 'event 2',
    })

    const updated = await DbEvents.markRead([e1.id, e2.id])

    expect(updated).toBe(2)

    const unread = (await DbEvents.getByMediaId(media.id)).filter(
      (e) => !e.read
    )

    expect(unread).toHaveLength(0)
  })

  test('returns 0 when ids array is empty', async () => {
    const updated = await DbEvents.markRead([])

    expect(updated).toBe(0)
  })

  test('only marks specified ids, leaves others unread', async () => {
    const media = await seedMedia()

    const e1 = await DbEvents.create({
      media_id: media.id,
      entity_type: 'download',
      entity_id: 'HASH1',
      event_type: 'error',
      message: 'to mark',
    })

    await DbEvents.create({
      media_id: media.id,
      entity_type: 'download',
      entity_id: 'HASH2',
      event_type: 'error',
      message: 'to keep',
    })

    await DbEvents.markRead([e1.id])

    const unread = (await DbEvents.getByMediaId(media.id)).filter(
      (e) => !e.read
    )

    expect(unread).toHaveLength(1)
    expect(unread[0].message).toBe('to keep')
  })
})

describe('cascade delete', () => {
  test('deleting media cascades to events', async () => {
    const media = await seedMedia()

    await DbEvents.create({
      media_id: media.id,
      entity_type: 'download',
      entity_id: 'HASH1',
      event_type: 'created',
      message: 'will be deleted',
    })

    await DbMedia.delete(media.id)

    const events = await DbEvents.getByMediaId(media.id)

    expect(events).toHaveLength(0)
  })
})
