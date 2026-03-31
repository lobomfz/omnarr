import { describe, expect, test } from 'bun:test'

import { BeyondHdAdapter } from '@/integrations/indexers/beyond-hd'

import '../mocks/beyond-hd'

const bhd = new BeyondHdAdapter({
  type: 'beyond-hd',
  api_key: 'test-api-key',
  rss_key: 'test-rss-key',
})

describe('BeyondHdAdapter', () => {
  test('search returns releases', async () => {
    const results = await bhd.search({ imdb_id: 'tt0133093' })

    expect(results).toHaveLength(2)
  })

  test('parses resolution from category', async () => {
    const results = await bhd.search({ imdb_id: 'tt0133093' })

    expect(results[0].resolution).toBe('2160p')
    expect(results[1].resolution).toBe('1080p')
  })

  test('parses codec from name', async () => {
    const results = await bhd.search({ imdb_id: 'tt0133093' })

    expect(results[0].codec).toBe('x265')
    expect(results[1].codec).toBe('x264')
  })

  test('parses HDR flags', async () => {
    const results = await bhd.search({ imdb_id: 'tt0133093' })

    expect(results[0].hdr).toEqual(['DV', 'HDR10'])
    expect(results[1].hdr).toEqual([])
  })

  test('maps torrent_id and download_url', async () => {
    const results = await bhd.search({ imdb_id: 'tt0133093' })

    expect(results[0].torrent_id).toBe('1001')
    expect(results[0].download_url).toBe('https://beyond-hd.me/dl/abc123')
  })
})
