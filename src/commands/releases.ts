import { defineCommand, option } from '@bunli/core'
import { type } from '@lobomfz/db'

import { Handler } from '@/commands/handler'

export const ReleasesCommand = defineCommand({
  name: 'releases',
  description: 'Search torrent releases for a TMDB media',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
    season: option(type('string.numeric.parse | undefined'), {
      description: 'Filter by season number',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).releases({ season: flags.season }),
})
