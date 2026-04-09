import { describe, expect, test } from 'bun:test'

import { createRouterClient } from '@orpc/server'

import { router } from '@/api/router'
import '@/api/arktype'
import { indexerMap } from '@/integrations/indexers/registry'
import { config } from '@/lib/config'

const client = createRouterClient(router)

describe('config.status', () => {
  test('returns indexer details and boolean fields matching config state', async () => {
    const result = await client.config.status()

    expect(result.indexers).toEqual(
      config.indexers.map((c) => ({
        type: c.type,
        media_types: indexerMap[c.type].types,
        source: indexerMap[c.type].source,
      }))
    )
    expect(result.has_download_client).toBe(!!config.download_client)
    expect(result.has_root_folder).toBe(
      !!(config.root_folders?.movie || config.root_folders?.tv)
    )
  })
})
