import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { type } from 'arktype'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { orpc } from '@/web/client'

import { VideoPlayer } from './-components/video-player'

const searchSchema = type({
  video: 'number.integer',
  audio: 'number.integer',
  'sub?': 'number.integer',
})

export const Route = createFileRoute('/media/$id/play')({
  component: PlayerPage,
  validateSearch: (search) => searchSchema.assert(search),
})

function usePlayerStart() {
  return useMutation(orpc.player.start.mutationOptions())
}

function usePlayerStop() {
  return useMutation(orpc.player.stop.mutationOptions())
}

function PlayerPage() {
  const { id } = Route.useParams()
  const { video, audio, sub } = Route.useSearch()
  const router = useRouter()
  const { mutateAsync: start } = usePlayerStart()
  const { mutateAsync: stop } = usePlayerStop()
  const [hlsPath, setHlsPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const result = await start({ media_id: id, video, audio, sub })

        if (!cancelled) {
          setHlsPath(result.hlsPath)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to start player'
          )
        }
      }
    }

    init()

    return () => {
      cancelled = true
      stop({}).catch(() => {})
    }
  }, [id, video, audio, sub, start, stop])

  const handleBack = useCallback(() => {
    router.navigate({ to: '/media/$id', params: { id } })
  }, [router, id])

  if (error) {
    return (
      <div
        data-component="player-error"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black text-destructive"
      >
        {error}
      </div>
    )
  }

  if (!hlsPath) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <Loader2 className="size-8 animate-spin text-white/50" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50">
      <VideoPlayer hlsPath={hlsPath} onBack={handleBack} />
    </div>
  )
}
