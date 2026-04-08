import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient()

mock.module('@/web/main', () => ({ queryClient }))

const { QueryCache } = await import('@/web/lib/query-cache')

beforeEach(() => {
  queryClient.clear()
})

const queryOptions = {
  queryKey: ['test'],
  queryFn: () => [] as { id: number; name: string; status: string }[],
}

const nestedQueryOptions = {
  queryKey: ['nested'],
  queryFn: () => ({
    title: 'media',
    downloads: [] as { id: number; progress: number; speed: number }[],
  }),
}

describe('QueryCache.patch', () => {
  test('patches matching item in array', () => {
    queryClient.setQueryData(queryOptions.queryKey, [
      { id: 1, name: 'a', status: 'pending' },
      { id: 2, name: 'b', status: 'pending' },
    ])

    QueryCache.patch(queryOptions, { id: 1 }, { status: 'done' })

    const data = queryClient.getQueryData(queryOptions.queryKey) as any[]

    expect(data[0]).toEqual({ id: 1, name: 'a', status: 'done' })
    expect(data[1]).toEqual({ id: 2, name: 'b', status: 'pending' })
  })

  test('leaves array unchanged when no match', () => {
    queryClient.setQueryData(queryOptions.queryKey, [
      { id: 1, name: 'a', status: 'pending' },
    ])

    QueryCache.patch(queryOptions, { id: 99 }, { status: 'done' })

    const data = queryClient.getQueryData(queryOptions.queryKey) as any[]

    expect(data[0]).toEqual({ id: 1, name: 'a', status: 'pending' })
  })

  test('patches matching item in nested array', () => {
    queryClient.setQueryData(nestedQueryOptions.queryKey, {
      title: 'media',
      downloads: [
        { id: 1, progress: 0.5, speed: 100 },
        { id: 2, progress: 0.3, speed: 200 },
      ],
    })

    QueryCache.patch(
      nestedQueryOptions,
      { downloads: { id: 1 } },
      { progress: 0.9, speed: 500 }
    )

    const data = queryClient.getQueryData(nestedQueryOptions.queryKey) as any

    expect(data.downloads[0]).toEqual({ id: 1, progress: 0.9, speed: 500 })
    expect(data.downloads[1]).toEqual({ id: 2, progress: 0.3, speed: 200 })
  })

  test('no-ops when cache is empty', () => {
    QueryCache.patch(queryOptions, { id: 1 }, { status: 'done' })

    const data = queryClient.getQueryData(queryOptions.queryKey)

    expect(data).toBeUndefined()
  })

  test('patches multiple matching items in array', () => {
    queryClient.setQueryData(queryOptions.queryKey, [
      { id: 1, name: 'a', status: 'active' },
      { id: 2, name: 'b', status: 'active' },
      { id: 3, name: 'c', status: 'done' },
    ])

    QueryCache.patch(queryOptions, { status: 'active' }, { name: 'updated' })

    const data = queryClient.getQueryData(queryOptions.queryKey) as any[]

    expect(data[0].name).toBe('updated')
    expect(data[1].name).toBe('updated')
    expect(data[2].name).toBe('c')
  })
})

describe('QueryCache.invalidate', () => {
  test('invalidates query by key', () => {
    queryClient.setQueryData(queryOptions.queryKey, [{ id: 1 }])

    QueryCache.invalidate(queryOptions)

    const state = queryClient.getQueryState(queryOptions.queryKey)

    expect(state?.isInvalidated).toBe(true)
  })
})
