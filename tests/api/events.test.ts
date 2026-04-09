import { beforeEach, describe, expect, test } from 'bun:test'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { DbEvents } from '@/db/events'

import { TestSeed } from '../helpers/seed'

const client = createRouterClient(router)

beforeEach(() => {
  TestSeed.reset()
})

describe('events.getByMediaId', () => {
  test('returns events for a media', async () => {
    const media = await TestSeed.library.matrix()

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
    const media = await TestSeed.library.matrix()

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
