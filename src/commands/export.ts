import { defineCommand, option } from '@bunli/core'
import { type } from 'arktype'

import { Handler } from '@/handler'

export const ExportCommand = defineCommand({
  name: 'export',
  description: 'Export media to a single MKV file with all tracks',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
    video: option(type('string.numeric.parse | undefined'), {
      description: 'Video track index (required if multiple)',
    }),
    season: option(type('string.numeric.parse | undefined'), {
      description: 'Season number (required for TV)',
    }),
    episode: option(type('string.numeric.parse | undefined'), {
      description: 'Episode number (required for TV)',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).export({
      video: flags.video,
      season: flags.season,
      episode: flags.episode,
    }),
})
