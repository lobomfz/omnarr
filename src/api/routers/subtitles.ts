import { os } from '@orpc/server'

import { SubtitlesSchemas } from '@/api/schemas'
import { Downloads } from '@/core/downloads'
import { Releases } from '@/core/releases'
import { errors } from '@/shared/errors'

export const subtitlesRouter = {
  search: os
    .input(SubtitlesSchemas.search)
    .errors(
      errors([
        'MEDIA_NOT_FOUND',
        'TV_REQUIRES_SEASON',
        'NO_IMDB_ID',
        'NO_SUBTITLE_INDEXER',
      ])
    )
    .handler(({ input }) =>
      new Releases().searchSubtitles(input.media_id, input)
    ),

  download: os
    .input(SubtitlesSchemas.download)
    .handler(({ input }) => new Downloads().enqueue(input)),

  autoMatch: os
    .input(SubtitlesSchemas.autoMatch)
    .errors(
      errors([
        'MEDIA_NOT_FOUND',
        'TV_REQUIRES_SEASON_EPISODE',
        'EPISODE_NOT_FOUND',
      ])
    )
    .handler(({ input }) => new Downloads().autoMatchSubtitles(input)),
}
