import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { orpc, orpcWs } from '@/web/client'
import { useQueryCache } from '@/web/lib/use-query-cache'

export function useDownloadProgressSubscription() {
  const cache = useQueryCache()
  const cursorRef = useRef(0)

  const { data } = useQuery(
    orpcWs.downloadProgress.experimental_streamedOptions({
      retry: false,
    })
  )

  useEffect(() => {
    if (!data) {
      return
    }

    const newEvents = data.slice(cursorRef.current)
    cursorRef.current = data.length

    const listInProgress = orpc.downloads.listInProgress.queryOptions({})

    for (const event of newEvents) {
      if (event.active) {
        cache.upsert(listInProgress, { id: event.id }, event)
      } else {
        cache.remove(listInProgress, { id: event.id })
      }

      cache.patch(
        orpc.library.getInfo.queryOptions({ input: { id: event.media_id } }),
        { downloads: { id: event.id } },
        {
          progress: event.progress,
          speed: event.speed,
          eta: event.eta,
          status: event.status,
          error_at: event.error_at,
        }
      )

      cache.patch(
        orpc.library.list.queryOptions({ input: {} }),
        { id: event.media_id },
        {
          download: {
            status: event.status,
            progress: event.progress,
            speed: event.speed,
          },
          unread_error_count: event.unread_error_count,
        }
      )
    }
  }, [data, cache])
}
