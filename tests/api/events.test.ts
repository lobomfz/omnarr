import { beforeEach, describe, expect, test } from 'bun:test'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { database } from '@/db/connection'
import { DbEvents } from '@/db/events'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/lib/utils'

const client = createRouterClient(router)

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

describe('events.getByMediaId', () => {
  test('returns events for a media', async () => {
    const media = await seedMedia()

    await DbEvents.create({
      media_id: media.id,
      entity_type: 'download',
      entity_id: 'HASH1',
      event_type: 'created',
      message: 'Download started',
    })

    const result = await client.events.getByMediaId({
      media_id: media.id,
    })

    expect(result).toHaveLength(1)
    expect(result[0].message).toBe('Download started')
  })
})

describe('events.markRead', () => {
  test('marks events as read and returns count', async () => {
    const media = await seedMedia()

    const e1 = await DbEvents.create({
      media_id: media.id,
      entity_type: 'download',
      entity_id: 'HASH1',
      event_type: 'error',
      message: 'Failed',
    })

    const result = await client.events.markRead({ ids: [e1.id] })

    expect(result).toBe(1)

    const events = await client.events.getByMediaId({
      media_id: media.id,
    })

    expect(events[0].read).toBe(true)
  })
})
