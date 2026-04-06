import { defineCommand, option } from '@bunli/core'
import { type } from '@lobomfz/db'

import { Handler } from '@/commands/handler'

export const SearchCommand = defineCommand({
  name: 'search',
  description: 'Search TMDB for movies and TV shows',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).search(),
})
