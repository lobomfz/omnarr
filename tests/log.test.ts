import { describe, expect, test, beforeEach } from 'bun:test'
import { rm } from 'fs/promises'

import { envVariables } from '@/lib/env'
import { Log } from '@/lib/log'

beforeEach(async () => {
  await rm(envVariables.OMNARR_LOG_PATH, { force: true })
})

describe('Log', () => {
  test('info writes line with correct format', async () => {
     Log.info('test message')

    const content = await Bun.file(envVariables.OMNARR_LOG_PATH).text()
    const lines = content.trimEnd().split('\n')

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z \[INFO\] test message$/
    )
  })

  test('warn writes line with WARN level', async () => {
     Log.warn('something wrong')

    const content = await Bun.file(envVariables.OMNARR_LOG_PATH).text()

    expect(content).toContain('[WARN] something wrong')
  })

  test('error writes line with ERROR level', async () => {
     Log.error('critical failure')

    const content = await Bun.file(envVariables.OMNARR_LOG_PATH).text()

    expect(content).toContain('[ERROR] critical failure')
  })

  test('appends multiple lines', async () => {
     Log.info('first')
     Log.warn('second')
     Log.error('third')

    const content = await Bun.file(envVariables.OMNARR_LOG_PATH).text()
    const lines = content.trimEnd().split('\n')

    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('[INFO] first')
    expect(lines[1]).toContain('[WARN] second')
    expect(lines[2]).toContain('[ERROR] third')
  })
})
