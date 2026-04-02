import { beforeEach, describe, expect, test } from 'bun:test'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { database } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/lib/utils'

const client = createRouterClient(router)

beforeEach(() => {
  database.reset()
})

async function seedMovie() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    imdb_id: 'tt0133093',
    year: 1999,
    poster_path: '/abc123.jpg',
  })

  return await DbMedia.create({
    id: deriveId('603:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/movies',
  })
}

describe('library.list', () => {
  test('wiring: routes to DbMedia.list and returns data', async () => {
    await seedMovie()

    const result = await client.library.list({})

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('The Matrix')
    expect(result[0].poster_path).toBe('/abc123.jpg')
  })

  test('passes media_type filter to db layer', async () => {
    await seedMovie()

    const result = await client.library.list({ media_type: 'tv' })

    expect(result).toHaveLength(0)
  })
})
