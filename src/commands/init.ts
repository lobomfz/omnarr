import { defineCommand, option } from '@bunli/core'
import { type } from 'arktype'

import { InitWizard } from '@/init-wizard'

export const InitCommand = defineCommand({
  name: 'init',
  description: 'Create config file',
  options: {
    empty: option(type('boolean | undefined'), {
      description: 'Create empty config with schema only',
    }),
    update: option(type('boolean | undefined'), {
      description: 'Update config schema only',
    }),
  },
  handler: ({ prompt, flags }) =>
    new InitWizard(prompt).run({ empty: flags.empty, update: flags.update }),
})
