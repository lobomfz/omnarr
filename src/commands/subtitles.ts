import { defineCommand, option } from '@bunli/core'
import { type } from 'arktype'

import { Handler } from '@/commands/handler'
import { subdlLanguage } from '@/integrations/indexers/subdl'

export const SubtitlesCommand = defineCommand({
  name: 'subtitles',
  description: 'Search subtitles for media in library',
  options: {
    json: option(type('boolean | undefined'), {
      description: 'Output as JSON',
    }),
    auto: option(type('boolean | undefined'), {
      description: 'Auto-match: download and test subtitles until one syncs',
    }),
    season: option(type('string.numeric.parse | undefined'), {
      description: 'Season number (required for TV)',
    }),
    episode: option(type('string.numeric.parse | undefined'), {
      description: 'Episode number (required for TV)',
    }),
    lang: option(subdlLanguage.or(type('undefined')), {
      description: 'Override configured subtitle language',
    }),
  },
  handler: ({ positional, flags }) =>
    new Handler(positional, flags.json).subtitles({
      auto: flags.auto,
      season: flags.season,
      episode: flags.episode,
      lang: flags.lang,
    }),
})
