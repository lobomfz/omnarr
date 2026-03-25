import { defineCommand, option } from '@bunli/core'
import { type } from 'arktype'

import { Handler } from '@/handler'

export const ExtractCommand = defineCommand({
  name: 'extract',
  description: 'Extract tracks from scanned media files',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).extract(),
})
