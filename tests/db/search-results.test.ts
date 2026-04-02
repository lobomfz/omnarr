import { beforeEach, describe, expect, test } from 'bun:test'

import { database } from '@/db/connection'
import { DbSearchResults } from '@/db/search-results'
import { deriveId } from '@/lib/utils'

beforeEach(() => {
  database.reset()
})

describe('DbSearchResults', () => {
  test('upsert inserts with derived IDs', async () => {
    const results = await DbSearchResults.upsert([
      { tmdb_id: 603, media_type: 'movie', title: 'The Matrix', year: 1999 },
    ])

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(deriveId('603:movie'))
    expect(results[0].title).toBe('The Matrix')
    expect(results[0].year).toBe(1999)
  })

  test('upsert updates title and year on conflict', async () => {
    await DbSearchResults.upsert([
      { tmdb_id: 603, media_type: 'movie', title: 'The Matrix', year: 1999 },
    ])

    const updated = await DbSearchResults.upsert([
      {
        tmdb_id: 603,
        media_type: 'movie',
        title: 'The Matrix (Remastered)',
        year: 2024,
      },
    ])

    expect(updated).toHaveLength(1)
    expect(updated[0].id).toBe(deriveId('603:movie'))
    expect(updated[0].title).toBe('The Matrix (Remastered)')
    expect(updated[0].year).toBe(2024)
  })

  test('upsert with empty array returns empty', async () => {
    const results = await DbSearchResults.upsert([])

    expect(results).toHaveLength(0)
  })

  test('getById returns matching result', async () => {
    const [inserted] = await DbSearchResults.upsert([
      { tmdb_id: 603, media_type: 'movie', title: 'The Matrix', year: 1999 },
    ])

    const result = await DbSearchResults.getById(inserted.id)

    expect(result?.tmdb_id).toBe(603)
    expect(result?.media_type).toBe('movie')
  })

  test('getById returns undefined for non-existent id', async () => {
    const result = await DbSearchResults.getById('NOEXIST')

    expect(result).toBeUndefined()
  })
})
