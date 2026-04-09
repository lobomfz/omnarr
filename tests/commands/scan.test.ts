import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import '../helpers/api-server'
import { ScanCommand } from '@/commands/scan'

import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

describe('scan command', () => {
  test('enqueues scan for existing media', async () => {
    const media = await TestSeed.library.matrix()

    const result = await testCommand(ScanCommand, {
      args: [String(media.id)],
      flags: {},
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Scan enqueued')
  })

  test('errors when media_id does not exist', async () => {
    const result = await testCommand(ScanCommand, {
      args: ['NOTEXIST'],
      flags: {},
    })

    expect(result.exitCode).not.toBe(0)
  })
})
