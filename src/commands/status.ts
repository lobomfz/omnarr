import { defineCommand, option } from '@bunli/core'
import { type } from 'arktype'

import { Handler } from '@/commands/handler'

export const StatusCommand = defineCommand({
  name: 'status',
  description: 'Show active downloads',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
    watch: option(type('boolean | undefined'), {
      description: 'Live mode — refresh every 2s',
    }),
    limit: option(type('number | undefined'), {
      description: 'Max results (default: 10)',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).status(flags),
})
