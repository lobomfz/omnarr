import { describe, expect, test } from 'bun:test'

import { config } from '@/config'

describe('config', () => {
  test('reads and validates config from fixture', () => {
    expect(config.root_folders?.movie).toBe('/tmp/omnarr-test-movies')
    expect(config.root_folders?.tv).toBe('/tv')
  })

  test('parses tracks root folder', () => {
    expect(config.root_folders?.tracks).toBe('/tmp/omnarr-test-tracks')
  })

  test('parses indexers with discriminated union', () => {
    expect(config.indexers).toHaveLength(3)
    expect(config.indexers![0].type).toBe('beyond-hd')
    expect(config.indexers![1].type).toBe('yts')
    expect(config.indexers![2].type).toBe('superflix')
  })

  test('parses download client', () => {
    expect(config.download_client?.type).toBe('qbittorrent')
    expect(config.download_client?.url).toBe('http://localhost:19005')
  })

  test('applies default category', () => {
    expect(config.download_client?.category).toBe('omnarr')
  })

  test('applies default transcoding config when not specified', () => {
    expect(config.transcoding.video_crf).toBe(21)
    expect(config.transcoding.video_preset).toBe('veryfast')
  })
})
