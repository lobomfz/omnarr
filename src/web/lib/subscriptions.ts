import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { orpc, orpcWs } from '@/web/client'
import { useQueryCache } from '@/web/lib/use-query-cache'

export function useDownloadProgressSubscription() {
  const cache = useQueryCache()

  const { data } = useQuery(
    orpcWs.downloadProgress.experimental_streamedOptions({
      retry: false,
    })
  )

  const latest = data?.at(-1)

  useEffect(() => {
    if (!latest) {
      return
    }

    const progressUpdate = {
      progress: latest.progress,
      speed: latest.speed,
      eta: latest.eta,
      status: latest.status,
    }

    cache.patch(
      orpc.downloads.listActive.queryOptions({}),
      { id: latest.id },
      progressUpdate
    )

    cache.patch(
      orpc.library.getInfo.queryOptions({ input: { id: latest.media_id } }),
      { downloads: { id: latest.id } },
      progressUpdate
    )

    cache.patch(
      orpc.library.list.queryOptions({ input: {} }),
      { id: latest.media_id },
      {
        download: {
          status: latest.status,
          progress: latest.progress,
          speed: latest.speed,
        },
      }
    )
  }, [latest, cache])
}
