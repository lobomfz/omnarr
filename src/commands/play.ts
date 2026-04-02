import { defineCommand, option } from '@bunli/core'
import { type } from 'arktype'

import { Handler } from '@/commands/handler'

export const PlayCommand = defineCommand({
  name: 'play',
  description: 'Play media via HLS streaming',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
    port: option(type('string.numeric.parse | undefined'), {
      description: 'Server port (default: 8787)',
    }),
    video: option(type('string.numeric.parse | undefined'), {
      description: 'Video track index',
    }),
    audio: option(type('string.numeric.parse | undefined'), {
      description: 'Audio track index',
    }),
    sub: option(type('string.numeric.parse | undefined'), {
      description: 'Subtitle track index',
    }),
    season: option(type('string.numeric.parse | undefined'), {
      description: 'Season number (required for TV)',
    }),
    episode: option(type('string.numeric.parse | undefined'), {
      description: 'Episode number (required for TV)',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).play({
      port: flags.port,
      video: flags.video,
      audio: flags.audio,
      sub: flags.sub,
      season: flags.season,
      episode: flags.episode,
    }),
})
