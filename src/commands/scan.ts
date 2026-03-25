import { defineCommand, option } from '@bunli/core'
import { type } from 'arktype'

import { Handler } from '@/handler'

export const ScanCommand = defineCommand({
  name: 'scan',
  description: 'Scan media files and discover tracks',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
    force: option(type('boolean | undefined'), {
      description: 'Force re-scan of all files',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).scan({ force: flags.force }),
})
