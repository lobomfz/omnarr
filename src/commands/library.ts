import { defineCommand, option } from '@bunli/core'
import { type } from '@lobomfz/db'

import { Handler } from '@/commands/handler'

export const LibraryCommand = defineCommand({
  name: 'library',
  description: 'List media in your library',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).library(),
})
