import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import '../helpers/api-server'
import { ScanCommand } from '@/commands/scan'
import { database } from '@/db/connection'
import { DbMedia } from '@/db/media'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { deriveId } from '@/lib/utils'

beforeEach(() => {
  database.reset()
})

async function seedMedia() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    imdb_id: 'tt0133093',
    year: 1999,
  })

  return await DbMedia.create({
    id: deriveId('603:movie'),
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/movies',
  })
}

describe('scan command', () => {
  test('enqueues scan for existing media', async () => {
    const media = await seedMedia()

    const result = await testCommand(ScanCommand, {
      args: [String(media.id)],
      flags: {},
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Scan enqueued')
  })

  test('errors when media_id does not exist', async () => {
    const result = await testCommand(ScanCommand, {
      args: ['NOTEXIST'],
      flags: {},
    })

    expect(result.exitCode).not.toBe(0)
  })
})
