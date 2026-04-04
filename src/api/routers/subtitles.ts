import { os } from '@orpc/server'

import { SubtitlesSchemas } from '@/api/schemas'
import { Downloads } from '@/core/downloads'
import { Releases } from '@/core/releases'

export const subtitlesRouter = {
  search: os
    .input(SubtitlesSchemas.search)
    .handler(({ input }) =>
      new Releases().searchSubtitles(input.media_id, input)
    ),

  download: os
    .input(SubtitlesSchemas.download)
    .handler(({ input }) => new Downloads().enqueue(input)),

  autoMatch: os
    .input(SubtitlesSchemas.autoMatch)
    .handler(({ input }) => new Downloads().autoMatchSubtitles(input)),
}
