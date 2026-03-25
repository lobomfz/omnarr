import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'

import type { PromptApi } from '@bunli/core'
import type { Type } from 'arktype'

import type { Config } from '@/config'
import { configJsonSchema } from '@/config'
import { envVariables } from '@/env'
import { indexerMap } from '@/integrations/indexers/registry'

interface SchemaProp {
  key: string
  value: {
    branches: { domain?: string; unit?: unknown }[]
    meta: { label?: string }
  }
}

export class InitWizard {
  constructor(private prompt: PromptApi) {}

  async run(empty?: boolean) {
    if (empty) {
      await this.save({ indexers: [] })
      return
    }

    await this.save({
      root_folders: await this.promptRootFolders(),
      indexers: await this.promptIndexers(),
      download_client: await this.promptDownloadClient(),
    })
  }

  private async promptRootFolders() {
    const movie = await this.prompt('Movie root folder:', {
      placeholder: '/media/movies',
    })

    const tv = await this.prompt('TV root folder:', {
      placeholder: '/media/tv',
    })

    const tracks = await this.prompt('Tracks root folder:', {
      placeholder: '/media/tracks',
    })

    return { movie, tv, tracks }
  }

  private async promptIndexers() {
    const configs: Config['indexers'] = []

    let addMore = true

    while (addMore) {
      const adapters = Object.values(indexerMap)

      const selected = await this.prompt.select('Add indexer:', {
        options: [
          ...adapters.map((A) => ({ label: A.name, value: A })),
          { label: 'Done', value: null },
        ],
      })

      if (!selected) {
        break
      }

      const config = await this.promptFromSchema(selected.schema)
      configs.push(config as Config['indexers'][number])

      addMore = await this.prompt.confirm('Add another indexer?', {
        default: false,
      })
    }

    return configs
  }

  private async promptFromSchema(schema: Type) {
    const props = (schema as any).structure?.props as SchemaProp[] | undefined
    const result: Record<string, unknown> = {}

    if (!props) {
      return schema.assert(result)
    }

    for (const prop of props) {
      const branch = prop.value.branches[0]

      if (branch?.unit !== undefined) {
        result[prop.key] = branch.unit
        continue
      }

      if (branch?.domain === 'string') {
        const label = prop.value.meta?.label ?? `${prop.key}:`
        result[prop.key] = await this.prompt.text(label)
      }
    }

    return schema.assert(result)
  }

  private async promptDownloadClient() {
    const url = await this.prompt('qBittorrent URL:', {
      default: 'http://localhost:8080',
    })

    const username = await this.prompt('qBittorrent username:', {
      default: 'admin',
    })

    const password = await this.prompt('qBittorrent password:')

    return {
      type: 'qbittorrent' as const,
      url,
      username,
      password,
      category: 'omnarr',
    }
  }

  private async save(config: Config) {
    const configPath = envVariables.OMNARR_CONFIG_PATH
    const configDir = dirname(configPath)
    const output = { $schema: './schema.json', ...config }

    await mkdir(configDir, { recursive: true })

    await Promise.all([
      Bun.write(configPath, JSON.stringify(output, null, 2)),
      Bun.write(
        join(configDir, 'schema.json'),
        JSON.stringify(configJsonSchema, null, 2)
      ),
    ])

    console.log(`Config saved to ${configPath}`)
  }
}
