import { os } from '@orpc/server'

import { DownloadSchemas } from '@/api/schemas'
import { Downloads } from '@/core/downloads'
import { DbDownloads } from '@/db/downloads'

export const downloadsRouter = {
  list: os
    .input(DownloadSchemas.list)
    .handler(({ input }) => DbDownloads.list(input.limit)),

  listInProgress: os.handler(() => DbDownloads.listInProgress()),

  add: os
    .input(DownloadSchemas.add)
    .errors({
      RELEASE_NOT_FOUND: {},
      MEDIA_NOT_FOUND: {},
      DUPLICATE_DOWNLOAD: {},
      NO_DOWNLOAD_CLIENT: {},
      NO_ROOT_FOLDER: {},
      TORRENT_REJECTED: {},
      DOWNLOAD_CLIENT_UNREACHABLE: {},
      NO_SRT_IN_ARCHIVE: {},
      NO_SRT_EPISODE_PATTERN: {},
      NO_EPISODES: {},
      TMDB_UNAVAILABLE: {},
    })
    .handler(({ input }) => new Downloads().enqueue(input)),
}
