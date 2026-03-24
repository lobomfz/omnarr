import { describe, expect, test } from 'bun:test'

import { testCommand } from '@bunli/test'

import { ReleasesCommand } from '@/commands/releases'
import { SearchCommand } from '@/commands/search'
import '../mocks/tmdb'
import '../mocks/beyond-hd'
import '../mocks/yts'

async function getSearchId(query: string) {
  const result = await testCommand(SearchCommand, {
    args: [query],
    flags: { json: true },
  })
  return (JSON.parse(result.stdout) as { id: string }[])[0].id
}

describe('releases command', () => {
  test('returns combined results from all indexers', async () => {
    const searchId = await getSearchId('Matrix')

    const result = await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true },
    })

    expect(result.exitCode).toBe(0)

    const data = JSON.parse(result.stdout)
    expect(data).toHaveLength(4)
    expect(data[0].id).toHaveLength(6)
  })

  test('includes seeders, size, resolution, codec', async () => {
    const searchId = await getSearchId('Matrix')

    const result = await testCommand(ReleasesCommand, {
      args: [searchId],
      flags: { json: true },
    })

    const data = JSON.parse(result.stdout)
    const bhd = data.find((r: any) => r.name.includes('2160p.UHD.BluRay.x265'))

    expect(bhd.seeders).toBe(42)
    expect(bhd.size).toBe(50_000_000_000)
    expect(bhd.resolution).toBe('2160p')
    expect(bhd.codec).toBe('x265')
  })
})
