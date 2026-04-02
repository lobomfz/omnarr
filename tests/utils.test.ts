import { describe, expect, test } from 'bun:test'

import { deriveId } from '@/utils'

describe('deriveId', () => {
  test('produces 6-char uppercase base36 string', () => {
    const id = deriveId('603:movie')

    expect(id).toHaveLength(6)
    expect(id).toBe(id.toUpperCase())
    expect(id).toMatch(/^[0-9A-Z]{6}$/)
  })

  test('is stable across calls', () => {
    const a = deriveId('603:movie')
    const b = deriveId('603:movie')

    expect(a).toBe(b)
  })

  test('produces different IDs for different inputs', () => {
    const movie = deriveId('603:movie')
    const tv = deriveId('1399:tv')

    expect(movie).not.toBe(tv)
  })

  test('handles empty string', () => {
    const id = deriveId('')

    expect(id).toHaveLength(6)
    expect(id).toMatch(/^[0-9A-Z]{6}$/)
  })

  test('handles long input', () => {
    const id = deriveId('a'.repeat(10000))

    expect(id).toHaveLength(6)
    expect(id).toMatch(/^[0-9A-Z]{6}$/)
  })

  test('search and media IDs match for same tmdb_id:type', () => {
    const searchId = deriveId('603:movie')
    const mediaId = deriveId('603:movie')

    expect(searchId).toBe(mediaId)
  })
})
