import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, ScanLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { orpc, orpcWs } from '@/web/client'
import type { ScanFileProgressLatest } from '@/web/constants/scan'
import { SCAN_ERROR_DISPLAY, SCAN_PENDING_TIMEOUT } from '@/web/constants/scan'
import { useQueryCache } from '@/web/lib/use-query-cache'
import type { MediaInfo } from '@/web/types/library'

type PendingState = 'idle' | 'pending' | 'error'
type ScanProgress = { current: number; total: number; path: string } | null
type DisplayState = PendingState | 'scanning' | 'probing'

function useRescan(mediaId: string) {
  const cache = useQueryCache()

  return useMutation(
    orpc.library.rescan.mutationOptions({
      onSuccess: () => {
        cache.invalidate(
          orpc.events.getByMediaId.queryOptions({
            input: { media_id: mediaId },
          })
        )
      },
    })
  )
}

function deriveDisplayState(
  pending: PendingState,
  scanProgress: ScanProgress,
  scanFileProgress: ScanFileProgressLatest | null
): DisplayState {
  if (pending === 'error') {
    return 'error'
  }

  if (scanProgress && scanFileProgress) {
    return 'probing'
  }

  if (scanProgress) {
    return 'scanning'
  }

  return pending
}

export function ScanArea(props: {
  media: MediaInfo
  scanProgress: ScanProgress
  scanFileProgress: ScanFileProgressLatest | null
}) {
  const { mutate } = useRescan(props.media.id)
  const { data: scanEvents } = useQuery(
    orpcWs.scanProgress.experimental_streamedOptions({ retry: false })
  )
  const eventCount =
    scanEvents?.filter((e) => e.media_id === props.media.id).length ?? 0
  const eventCountAtClickRef = useRef(0)
  const [pendingState, setPendingState] = useState<PendingState>('idle')

  const hasCompleted = props.media.downloads.some(
    (d) => d.status === 'completed'
  )

  useEffect(() => {
    if (pendingState !== 'pending') {
      return
    }

    if (props.scanProgress || eventCount > eventCountAtClickRef.current) {
      setPendingState('idle')
    }
  }, [pendingState, eventCount, props.scanProgress])

  useEffect(() => {
    if (pendingState === 'idle') {
      return
    }

    const next: PendingState = pendingState === 'pending' ? 'error' : 'idle'
    const delay =
      pendingState === 'pending' ? SCAN_PENDING_TIMEOUT : SCAN_ERROR_DISPLAY

    const timer = setTimeout(() => setPendingState(next), delay)

    return () => clearTimeout(timer)
  }, [pendingState])

  const handleClick = () => {
    eventCountAtClickRef.current = eventCount
    setPendingState('pending')
    mutate({ media_id: props.media.id })
  }

  const state = deriveDisplayState(
    pendingState,
    props.scanProgress,
    props.scanFileProgress
  )

  return (
    <div
      data-component="scan-area"
      data-state={state}
      data-current={props.scanProgress?.current}
      data-total={props.scanProgress?.total}
      data-path={props.scanProgress?.path}
      data-current-step={props.scanFileProgress?.current_step}
      data-ratio={props.scanFileProgress?.ratio}
    >
      <button
        type="button"
        data-slot="scan-button"
        disabled={!hasCompleted || state !== 'idle'}
        onClick={handleClick}
        className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
      >
        {pendingState === 'pending' ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ScanLine className="size-3.5" />
        )}
        Scan
      </button>
    </div>
  )
}
