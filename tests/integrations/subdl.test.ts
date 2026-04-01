import { describe, expect, test } from 'bun:test'

import { SubdlAdapter } from '@/integrations/indexers/subdl'

import '../mocks/subdl'

const subdl = new SubdlAdapter({
  type: 'subdl',
  api_key: 'test-api-key',
  languages: ['EN'],
})

describe('SubdlAdapter', () => {
  test('search returns subtitles for imdb_id', async () => {
    const results = await subdl.search({ imdb_id: 'tt0133093' })

    expect(results).toHaveLength(2)
  })

  test('filters by configured languages', async () => {
    const adapter = new SubdlAdapter({
      type: 'subdl',
      api_key: 'test-api-key',
      languages: ['FR'],
    })

    const results = await adapter.search({ imdb_id: 'tt0133093' })

    expect(results).toHaveLength(1)
    expect(results[0].name).toContain('FR')
  })

  test('languages in params override config', async () => {
    const results = await subdl.search({
      imdb_id: 'tt0133093',
      languages: ['FR'],
    })

    expect(results).toHaveLength(1)
    expect(results[0].name).toContain('FR')
  })

  test('TV search with season and episode', async () => {
    const results = await subdl.search({
      imdb_id: 'tt0903747',
      season_number: 1,
      episode_number: 1,
    })

    expect(results).toHaveLength(1)
    expect(results[0].name).toContain('S01E01')
  })

  test('returns empty for unknown imdb_id', async () => {
    const results = await subdl.search({ imdb_id: 'tt9999999' })

    expect(results).toHaveLength(0)
  })

  test('returns empty without imdb_id', async () => {
    const results = await subdl.search({})

    expect(results).toHaveLength(0)
  })

  test('maps source_id with subdl prefix', async () => {
    const results = await subdl.search({ imdb_id: 'tt0133093' })

    expect(results[0].source_id).toStartWith('subdl:')
  })

  test('maps download_url with download base', async () => {
    const results = await subdl.search({ imdb_id: 'tt0133093' })

    expect(results[0].download_url).toContain('/subtitle/')
  })

  test('propagates API errors', async () => {
    const adapter = new SubdlAdapter({
      type: 'subdl',
      api_key: '',
      languages: ['EN'],
    })

    await expect(() => adapter.search({ imdb_id: 'tt0133093' })).toThrow(
      'API key required'
    )
  })
})
