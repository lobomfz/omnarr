import { os } from '@orpc/server'

import { config } from '@/lib/config'

export const configRouter = {
  status: os.handler(() => ({
    has_indexers: !!config.indexers.length,
    has_download_client: !!config.download_client,
    has_root_folder: !!(config.root_folders?.movie || config.root_folders?.tv),
  })),
}
