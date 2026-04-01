import { defineCommand, option } from '@bunli/core'
import { type } from 'arktype'

import { Handler } from '@/handler'

export const DownloadCommand = defineCommand({
  name: 'download',
  description: 'Download a release by ID',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
    'audio-only': option(type('boolean | undefined'), {
      description: 'Download only audio tracks as separate .mka files',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).download({
      audio_only: flags['audio-only'],
    }),
})
