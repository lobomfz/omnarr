import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { orpc, orpcWs } from '@/web/client'
import { useQueryCache } from '@/web/lib/use-query-cache'

export function useScanProgress(mediaId: string) {
  const cache = useQueryCache()

  const { data } = useQuery(
    orpcWs.scanProgress.experimental_streamedOptions({
      retry: false,
    })
  )

  const latest = data?.findLast((e) => e.media_id === mediaId)

  useEffect(() => {
    if (!latest || latest.current < latest.total) {
      return
    }

    cache.invalidate(
      orpc.library.getInfo.queryOptions({ input: { id: mediaId } })
    )
  }, [latest?.current, latest?.total, mediaId, cache])

  if (!latest || latest.current >= latest.total) {
    return null
  }

  return {
    current: latest.current,
    total: latest.total,
    path: latest.path,
  }
}
