import { useSuspenseQuery } from '@tanstack/react-query'
import { createContext, use } from 'react'

import type { RouterOutputs } from '@/web/client'
import { orpc } from '@/web/client'

type ConfigStatus = RouterOutputs['config']['status']

const ConfigContext = createContext<ConfigStatus>(null!)

export function useConfig() {
  return use(ConfigContext)
}

export function ConfigProvider(props: { children: React.ReactNode }) {
  const { data } = useSuspenseQuery(
    orpc.config.status.queryOptions({
      staleTime: Infinity,
    })
  )

  return <ConfigContext value={data}>{props.children}</ConfigContext>
}
