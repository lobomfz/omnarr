import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { orpc, orpcWs } from '@/web/client'
import type { ScanFileProgressLatest } from '@/web/constants/scan'
import { useQueryCache } from '@/web/lib/use-query-cache'
import type { MediaInfo } from '@/web/types/library'

export function useScanFileProgress(
  mediaId: string,
  currentPath: string | undefined,
  initialScan?: MediaInfo['active_scan'] | null
): ScanFileProgressLatest | null {
  const { data } = useQuery(
    orpcWs.scanFileProgress.experimental_streamedOptions({ retry: false })
  )

  if (!currentPath) {
    return null
  }

  const latest = data?.findLast(
    (e) => e.media_id === mediaId && e.path === currentPath
  )

  if (latest) {
    return { current_step: latest.current_step, ratio: latest.ratio }
  }

  if (initialScan?.path === currentPath) {
    return { ratio: initialScan.ratio }
  }

  return null
}

export function useScanProgress(
  mediaId: string,
  initialScan?: MediaInfo['active_scan'] | null
) {
  const cache = useQueryCache()

  const { data } = useQuery(
    orpcWs.scanProgress.experimental_streamedOptions({
      retry: false,
    })
  )

  const { data: completedEvents } = useQuery(
    orpcWs.scanCompleted.experimental_streamedOptions({
      retry: false,
    })
  )

  const latestCompleted = completedEvents?.findLast(
    (e) => e.media_id === mediaId
  )

  useEffect(() => {
    if (!latestCompleted) {
      return
    }

    cache.invalidate(
      orpc.library.getInfo.queryOptions({ input: { id: mediaId } })
    )

    cache.invalidate(
      orpc.events.getByMediaId.queryOptions({ input: { media_id: mediaId } })
    )
  }, [latestCompleted, mediaId, cache])

  const latest = data?.findLast((e) => e.media_id === mediaId)

  if (!latest) {
    if (!initialScan) {
      return null
    }

    return { path: initialScan.path }
  }

  if (latest.current >= latest.total) {
    return null
  }

  return { path: latest.path }
}
