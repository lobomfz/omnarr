import { os } from '@orpc/server'

import { indexerMap } from '@/integrations/indexers/registry'
import { config } from '@/lib/config'

export const configRouter = {
  status: os.handler(() => ({
    indexers: config.indexers.map((c) => ({
      type: c.type,
      media_types: indexerMap[c.type].types,
      source: indexerMap[c.type].source,
    })),
    has_download_client: !!config.download_client,
    has_root_folder: !!(config.root_folders?.movie || config.root_folders?.tv),
  })),
}
