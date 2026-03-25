import { afterEach, describe, expect, test } from 'bun:test'
import { unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { mockPromptResponses, testCommand } from '@bunli/test'

import { InitCommand } from '@/commands/init'
import { envVariables } from '@/env'

const configPath = envVariables.OMNARR_CONFIG_PATH
const schemaPath = join(dirname(configPath), 'schema.json')
const originalConfig = await Bun.file(configPath).text()

describe('init command', () => {
  afterEach(async () => {
    await Bun.write(configPath, originalConfig)
    await unlink(schemaPath).catch(() => {})
  })

  test('--empty creates config with schema reference and empty indexers', async () => {
    const result = await testCommand(InitCommand, {
      flags: { empty: true },
    })

    expect(result.exitCode).toBe(0)

    const config = await Bun.file(configPath).json()
    expect(config).toEqual({
      $schema: './schema.json',
      indexers: [],
    })
  })

  test('--empty writes JSON schema file alongside config', async () => {
    await testCommand(InitCommand, {
      flags: { empty: true },
    })

    const schema = await Bun.file(schemaPath).json()
    expect(schema.type).toBe('object')
  })

  test('wizard collects folders, indexer, and download client', async () => {
    const result = await testCommand(
      InitCommand,
      mockPromptResponses({
        'Movie root folder:': '/media/movies',
        'TV root folder:': '/media/tv',
        'Tracks root folder:': '/media/tracks',
        'Add indexer:': '2',
        'Add another indexer?': 'n',
        'qBittorrent URL:': 'http://localhost:8080',
        'qBittorrent username:': 'admin',
        'qBittorrent password:': 'secret',
      })
    )

    expect(result.exitCode).toBe(0)

    const config = await Bun.file(configPath).json()
    expect(config.root_folders).toEqual({
      movie: '/media/movies',
      tv: '/media/tv',
      tracks: '/media/tracks',
    })
    expect(config.indexers).toEqual([{ type: 'yts' }])
    expect(config.download_client).toEqual({
      type: 'qbittorrent',
      url: 'http://localhost:8080',
      username: 'admin',
      password: 'secret',
      category: 'omnarr',
    })
  })
})
