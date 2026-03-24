import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'

import type { PromptApi } from '@bunli/core'

import type { Config } from '@/config'
import { configJsonSchema } from '@/config'
import { envVariables } from '@/env'
import { indexerMap } from '@/integrations/indexers/registry'

export class InitWizard {
  constructor(private prompt: PromptApi) {}

  async run(empty?: boolean) {
    if (empty) {
      await this.save({ indexers: [] })
      return
    }

    console.log('omnarr setup')

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

    return { movie, tv }
  }

  private async promptIndexers() {
    const indexers: Config['indexers'] = []

    let addMore = true

    while (addMore) {
      const indexerType = await this.prompt.select('Add indexer:', {
        options: [
          { label: 'Beyond-HD', value: 'beyond-hd' as const },
          { label: 'YTS', value: 'yts' as const },
          { label: 'Done', value: 'done' as const },
        ],
      })

      if (indexerType === 'done') {
        break
      }

      const indexerConfig = await indexerMap[indexerType].promptConfig(
        this.prompt
      )

      indexers.push(indexerConfig)

      addMore = await this.prompt.confirm('Add another indexer?', {
        default: false,
      })
    }

    return indexers
  }

  private async promptDownloadClient() {
    const addQbt = await this.prompt.confirm('Configure qBittorrent?', {
      default: true,
    })

    if (!addQbt) {
      return null
    }

    const url = await this.prompt('qBittorrent URL:', {
      default: 'http://localhost:8080',
    })

    const username = await this.prompt('qBittorrent username:', {
      default: 'admin',
    })

    const password = await this.prompt.password('qBittorrent password:')

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
