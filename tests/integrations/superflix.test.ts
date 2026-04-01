import { describe, test, expect, afterAll } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { SuperflixAdapter } from '@/integrations/indexers/superflix'

import '../mocks/superflix'

const superflix = new SuperflixAdapter()
const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-superflix-'))

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('SuperflixAdapter', () => {
  describe('search', () => {
    test('returns release with correct metadata', async () => {
      const results = await superflix.search({ imdb_id: 'tt0133093' })

      expect(results).toHaveLength(1)
      expect(results[0].source_id).toBe('superflix:tt0133093')
      expect(results[0].name).toBeNull()
      expect(results[0].resolution).toBe('1080p')
      expect(results[0].imdb_id).toBe('tt0133093')
      expect(results[0].download_url).toBe('imdb:tt0133093')
      expect(results[0].codec).toBeNull()
      expect(results[0].hdr).toEqual([])
    })

    test('returns empty for unknown movie', async () => {
      const results = await superflix.search({ imdb_id: 'tt9999999' })

      expect(results).toHaveLength(0)
    })

    test('returns empty when no streams', async () => {
      const results = await superflix.search({ imdb_id: 'tt0000000' })

      expect(results).toHaveLength(0)
    })

    test('estimates size from bandwidth and duration', async () => {
      const results = await superflix.search({ imdb_id: 'tt0133093' })

      expect(results[0].size).toBe(Math.round((5_000_000 * 1) / 8))
    })

    test('returns size 0 when video playlist fetch fails', async () => {
      const results = await superflix.search({ imdb_id: 'tt0000001' })

      expect(results).toHaveLength(1)
      expect(results[0].size).toBe(0)
    })
  })

  describe('getStreams', () => {
    test('returns video and audio streams', async () => {
      const streams = await superflix.getStreams('tt0133093')

      expect(streams.video).not.toBeNull()
      expect(streams.audio).toHaveLength(2)
      expect(streams.audio[0].lang).toBe('pt')
      expect(streams.audio[1].lang).toBe('en')
    })

    test('throws when movie not found', async () => {
      await expect(() => superflix.getStreams('tt9999999')).toThrow(
        /page data not found/
      )
    })

    test('returns empty audio when no audio streams', async () => {
      const streams = await superflix.getStreams('tt0000000')

      expect(streams.video).not.toBeNull()
      expect(streams.audio).toHaveLength(0)
    })
  })

  describe('downloadStream', () => {
    test('writes chunks to file', async () => {
      const streams = await superflix.getStreams('tt0133093')
      const outputPath = join(tmpDir, 'audio_pt.ts')

      await superflix.downloadStream(streams.audio[0], outputPath)

      const file = Bun.file(outputPath)

      expect(await file.exists()).toBe(true)
      expect(file.size).toBeGreaterThan(0)
    })
  })
})
