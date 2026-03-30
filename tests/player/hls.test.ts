import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterAll,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { database } from '@/db/connection'
import { Player } from '@/player'

import { MediaFixtures } from '../fixtures/media'
import { seedMedia, seedDownloadWithTracks } from './seed'

const tmpDir = await mkdtemp(join(tmpdir(), 'omnarr-hls-'))
const refSubsMkv = join(tmpDir, 'ref-subs.mkv')

beforeAll(async () => {
  await MediaFixtures.generateWithSubs(refSubsMkv, tmpDir)
})

beforeEach(() => {
  database.reset()
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('Player — subtitle conversion', () => {
  test('converts subtitle to WebVTT', async () => {
    const media = await seedMedia()
    const filePath = join(tmpDir, 'subs/movie.mkv')

    await MediaFixtures.copy(refSubsMkv, filePath)

    await seedDownloadWithTracks(media.id, 'sub_hash', filePath, [
      {
        stream_index: 0,
        stream_type: 'video',
        codec_name: 'h264',
        is_default: true,
        width: 320,
        height: 240,
      },
      {
        stream_index: 1,
        stream_type: 'audio',
        codec_name: 'aac',
        is_default: true,
      },
      {
        stream_index: 2,
        stream_type: 'subtitle',
        codec_name: 'subrip',
        is_default: false,
        language: 'por',
      },
    ])

    const player = new Player({ id: media.id })
    const resolved = await player.resolveTracks({ sub: 0 })
    const hlsDir = join(tmpDir, 'hls-subs')

    await Player.convertSubtitle(resolved.subtitle!, hlsDir)

    const vttFile = Bun.file(join(hlsDir, 'subs.vtt'))

    expect(await vttFile.exists()).toBe(true)

    const content = await vttFile.text()

    expect(content).toContain('WEBVTT')
  })
})
