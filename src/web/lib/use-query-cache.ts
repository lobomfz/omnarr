import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

type ArrayItem<T> = T extends readonly (infer U)[] ? U : never

type InferData<T> = T extends {
  queryFn: (...args: any[]) => infer R
}
  ? R extends Promise<infer D>
    ? D
    : R
  : never

type MatcherFor<Data> = Data extends readonly (infer U)[]
  ? Partial<U>
  : {
      [K in keyof Data as Data[K] extends readonly any[] ? K : never]?: Partial<
        ArrayItem<Data[K]>
      >
    }

type TargetOf<Data, M> = Data extends readonly (infer U)[]
  ? U
  : keyof M extends keyof Data
    ? ArrayItem<Data[keyof M]>
    : never

type QueryOptions = {
  queryKey: readonly unknown[]
  queryFn: (...args: any[]) => unknown
}

type HasQueryKey = { queryKey: readonly unknown[] }

// @human: all updates from sockets MUST pass through here
export function useQueryCache() {
  const qc = useQueryClient()

  return useMemo(
    () => ({
      invalidate(options: HasQueryKey) {
        void qc.invalidateQueries({ queryKey: options.queryKey })
      },

      upsert<T extends QueryOptions, M extends MatcherFor<InferData<T>>>(
        options: T,
        matcher: M,
        entry: TargetOf<InferData<T>, M>
      ) {
        type Data = InferData<T>
        type Target = TargetOf<Data, M>

        qc.setQueryData(options.queryKey, (old: Data | undefined) => {
          if (!old || !Array.isArray(old)) {
            return old
          }

          const entries = Object.entries(matcher)
          const idx = old.findIndex((item: Target) =>
            entries.every(([key, value]) => item[key as keyof Target] === value)
          )

          if (idx === -1) {
            return [...old, entry] as Data
          }

          return old.map((item: Target, i: number) =>
            i === idx
              ? {
                  ...(item as Record<string, unknown>),
                  ...(entry as Record<string, unknown>),
                }
              : item
          ) as Data
        })
      },

      remove<T extends QueryOptions, M extends MatcherFor<InferData<T>>>(
        options: T,
        matcher: M
      ) {
        type Data = InferData<T>
        type Target = TargetOf<Data, M>

        qc.setQueryData(options.queryKey, (old: Data | undefined) => {
          if (!old || !Array.isArray(old)) {
            return old
          }

          const entries = Object.entries(matcher)

          return old.filter(
            (item: Target) =>
              !entries.every(
                ([key, value]) => item[key as keyof Target] === value
              )
          ) as Data
        })
      },

      patch<T extends QueryOptions, M extends MatcherFor<InferData<T>>>(
        options: T,
        matcher: M,
        update: Partial<TargetOf<InferData<T>, M>>
      ) {
        type Data = InferData<T>
        type Target = TargetOf<Data, M>

        qc.setQueryData(options.queryKey, (old: Data | undefined) => {
          if (!old) {
            return old
          }

          if (Array.isArray(old)) {
            const entries = Object.entries(matcher)

            return old.map((item: Target) => {
              const matches = entries.every(
                ([key, value]) => item[key as keyof Target] === value
              )

              if (!matches) {
                return item
              }

              return { ...(item as Record<string, unknown>), ...update }
            }) as Data
          }

          const result = { ...(old as Record<string, unknown>) }

          for (const [field, fieldMatcher] of Object.entries(matcher)) {
            const arr = result[field]

            if (!Array.isArray(arr)) {
              continue
            }

            const entries = Object.entries(
              fieldMatcher as Record<string, unknown>
            )

            result[field] = arr.map((item: Target) => {
              const matches = entries.every(
                ([key, value]) => item[key as keyof Target] === value
              )

              if (!matches) {
                return item
              }

              return { ...(item as Record<string, unknown>), ...update }
            })
          }

          return result as Data
        })
      },
    }),
    [qc]
  )
}
