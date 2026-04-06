import { defineCommand, option } from '@bunli/core'
import { type } from '@lobomfz/db'

import { Handler } from '@/commands/handler'

export const InfoCommand = defineCommand({
  name: 'info',
  description: 'Show detailed information about a media entry',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
    season: option(type('string.numeric.parse | undefined'), {
      description: 'Filter by season number',
    }),
    episode: option(type('string.numeric.parse | undefined'), {
      description: 'Filter by episode number',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).info(flags),
})
