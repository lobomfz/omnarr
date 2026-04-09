import { beforeEach, describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import '../helpers/api-server'
import { SearchCommand } from '@/commands/search'

import '../mocks/tmdb'
import { TestSeed } from '../helpers/seed'

beforeEach(() => {
  TestSeed.reset()
})

describe('search command', () => {
  test('returns results with short ID, type, year, title', async () => {
    const result = await testCommand(SearchCommand, {
      args: ['Matrix'],
      flags: { json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)

    expect(data).toHaveLength(1)
    expect(data[0].id).toHaveLength(6)
    expect(data[0].tmdb_id).toBe(603)
    expect(data[0].media_type).toBe('movie')
    expect(data[0].year).toBe(1999)
    expect(data[0].title).toBe('The Matrix')
  })

  test('returns tv results', async () => {
    const result = await testCommand(SearchCommand, {
      args: ['Breaking'],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)

    expect(data[0].tmdb_id).toBe(1399)
    expect(data[0].media_type).toBe('tv')
    expect(data[0].title).toBe('Breaking Bad')
  })

  test('shows message when no results', async () => {
    const result = await testCommand(SearchCommand, {
      args: ['xyznonexistent'],
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('No results found.')
  })
})
