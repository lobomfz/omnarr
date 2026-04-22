import { isDefinedError } from '@orpc/client'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { type } from 'arktype'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { ERROR_MAP } from '@/shared/errors'
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

function PlayerPage() {
  const { id } = Route.useParams()
  const { video, audio, sub } = Route.useSearch()
  const router = useRouter()
  const [hlsPath, setHlsPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { mutate: start } = useMutation(
    orpc.player.start.mutationOptions({
      onSuccess: (result) => {
        setHlsPath(result.hlsPath)
      },
      onError: (err) => {
        const message = isDefinedError(err)
          ? ERROR_MAP[err.code].message
          : err.message

        setError(message)
      },
    })
  )
  const { mutate: stop } = useMutation(orpc.player.stop.mutationOptions())

  useEffect(() => {
    start({ media_id: id, video, audio, sub })

    return () => {
      stop({})
    }
  }, [id, video, audio, sub, start, stop])

  const handleBack = useCallback(() => {
    void router.navigate({ to: '/media/$id', params: { id } })
  }, [router, id])

  if (error) {
    return (
      <div
        data-component="player-error"
        data-error-message={error}
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
