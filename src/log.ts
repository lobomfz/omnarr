import { appendFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

import { envVariables } from '@/env'

mkdirSync(dirname(envVariables.OMNARR_LOG_PATH), { recursive: true })

function write(level: string, message: string) {
  const line = `${new Date().toISOString()} [${level}] ${message}\n`

  appendFileSync(envVariables.OMNARR_LOG_PATH, line)
}

export const Log = {
  info(message: string) {
    write('INFO', message)
  },

  warn(message: string) {
    write('WARN', message)
  },

  error(message: string) {
    write('ERROR', message)
  },
}
