import { describe, expect, test } from 'bun:test'

import { YtsAdapter } from '@/integrations/indexers/yts'

import '../mocks/yts'

const yts = new YtsAdapter()

describe('YtsAdapter', () => {
  test('search returns releases for imdb_id', async () => {
    const results = await yts.search({ imdb_id: 'tt0133093' })

    expect(results).toHaveLength(2)
  })

  test('builds name from movie and torrent info', async () => {
    const results = await yts.search({ imdb_id: 'tt0133093' })

    expect(results[0].name).toBe('The Matrix (1999) [1080p] [bluray] [x264]')
    expect(results[1].name).toBe('The Matrix (1999) [2160p] [bluray] [x265]')
  })

  test('maps resolution and codec from torrent', async () => {
    const results = await yts.search({ imdb_id: 'tt0133093' })

    expect(results[0].resolution).toBe('1080p')
    expect(results[0].codec).toBe('x264')
    expect(results[1].resolution).toBe('2160p')
    expect(results[1].codec).toBe('x265')
  })

  test('generates magnet download_url', async () => {
    const results = await yts.search({ imdb_id: 'tt0133093' })

    expect(results[0].download_url).toStartWith('magnet:?xt=urn:btih:yts_hash_1080')
  })

  test('returns empty for unknown imdb_id', async () => {
    const results = await yts.search({ imdb_id: 'tt9999999' })

    expect(results).toHaveLength(0)
  })
})
