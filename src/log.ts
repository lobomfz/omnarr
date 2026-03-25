import { appendFile, mkdir } from 'fs/promises'
import { dirname } from 'path'

import { envVariables } from '@/env'

await mkdir(dirname(envVariables.OMNARR_LOG_PATH), { recursive: true })

async function write(level: string, message: string) {
  const line = `${new Date().toISOString()} [${level}] ${message}\n`

  await appendFile(envVariables.OMNARR_LOG_PATH, line)
}

export const Log = {
  async info(message: string) {
    await write('INFO', message)
  },

  async warn(message: string) {
    await write('WARN', message)
  },

  async error(message: string) {
    await write('ERROR', message)
  },
}
