import { beforeEach, describe, expect, test } from 'bun:test'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { database } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
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

describe('library.getInfo', () => {
  test('returns full media info with downloads and seasons arrays', async () => {
    const media = await seedMovie()

    await DbDownloads.create({
      media_id: media.id,
      source_id: 'test_hash',
      download_url: 'magnet:test',
      status: 'completed',
    })

    const result = await client.library.getInfo({ id: media.id })

    expect(result.id).toBe(media.id)
    expect(result.title).toBe('The Matrix')
    expect(result.year).toBe(1999)
    expect(result.downloads).toHaveLength(1)
    expect(result.seasons).toHaveLength(0)
  })

  test('throws when media does not exist', async () => {
    await expect(() => client.library.getInfo({ id: 'NOTEXIST' })).toThrow()
  })
})

describe('library.rescan', () => {
  test('throws when media does not exist', async () => {
    await expect(() => client.library.rescan({ media_id: 'NOTEXIST' })).toThrow(
      "Media 'NOTEXIST' not found."
    )
  })

  test('returns media_id for existing media', async () => {
    const media = await seedMovie()

    const result = await client.library.rescan({ media_id: media.id })

    expect(result.media_id).toBe(media.id)
  })
})
