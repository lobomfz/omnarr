import { defineCommand, option } from '@bunli/core'
import { type } from 'arktype'

import { Handler } from '@/handler'

export const WaitForCommand = defineCommand({
  name: 'wait-for',
  description: 'Wait for a torrent to finish downloading',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
    interval: option(type('number | undefined'), {
      description: 'Poll interval in seconds (default: 5)',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).waitFor(flags),
})
