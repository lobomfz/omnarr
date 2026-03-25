import { defineCommand, option } from '@bunli/core'
import { type } from 'arktype'

import { Handler } from '@/handler'

export const InfoCommand = defineCommand({
  name: 'info',
  description: 'Show detailed information about a media entry',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).info(),
})
