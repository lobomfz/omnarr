import { isDefinedError } from '@orpc/client'
import { useQueries, useMutation } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, Loader2, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ERROR_MAP } from '@/shared/errors'
import { orpc } from '@/web/client'
import { Toast } from '@/web/components/ui/toast'
import { cn } from '@/web/lib/cn'
import { useConfig } from '@/web/providers/config-provider'

import { ActionBar } from './action-bar'
import { ReleaseRow } from './release-row'

function useReleasesSearch(props: {
  tmdb_id: number
  media_type: 'movie' | 'tv'
  season_number?: number
}) {
  const config = useConfig()

  const indexers = config.indexers.filter(
    (i) => i.media_types.includes(props.media_type) && i.source !== 'subtitle'
  )

  const results = useQueries({
    queries: indexers.map((indexer) =>
      orpc.releases.searchSingle.queryOptions({
        input: {
          tmdb_id: props.tmdb_id,
          media_type: props.media_type,
          indexer_source: indexer.type,
          ...(props.season_number != null && {
            season_number: props.season_number,
          }),
        },
      })
    ),
  })

  const releases = results
    .flatMap((r) => r.data ?? [])
    .sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0))

  const statuses = indexers.map((indexer, i) => ({
    name: indexer.type,
    loading: results[i].isLoading,
    error: results[i].isError,
    count: results[i].data?.length ?? 0,
  }))

  const allSettled = results.every((r) => !r.isLoading)

  return { releases, statuses, allSettled }
}

function useDownloadMutation(props: {
  title: string
  onToast: (toast: {
    message: string
    type: 'success' | 'error'
    code: string
  }) => void
}) {
  return useMutation(
    orpc.downloads.add.mutationOptions({
      onSuccess: () => {
        props.onToast({
          message: `Download started: ${props.title}`,
          type: 'success',
          code: 'DOWNLOAD_STARTED',
        })
      },
      onError: (err) => {
        const code = isDefinedError(err) ? err.code : 'UNKNOWN'
        const message = isDefinedError(err) ? ERROR_MAP[err.code] : err.message

        props.onToast({ message, type: 'error', code })
      },
    })
  )
}

export function ReleasesSection(props: {
  tmdb_id: number
  media_type: 'movie' | 'tv'
  title: string
  season_number?: number
}) {
  const { releases, statuses, allSettled } = useReleasesSearch({
    tmdb_id: props.tmdb_id,
    media_type: props.media_type,
    season_number: props.season_number,
  })

  const [selected, setSelected] = useState<string | null>(null)
  const [audioOnly, setAudioOnly] = useState(false)
  const [toast, setToast] = useState<{
    message: string
    type: 'success' | 'error'
    code: string
  } | null>(null)

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const { mutate, isPending, isSuccess, reset } = useDownloadMutation({
    title: props.title,
    onToast: setToast,
  })

  const selectedRelease = releases.find((r) => r.id === selected)
  const isRipper = selectedRelease?.indexer_source === 'superflix'

  const handleSelect = (id: string) => {
    setSelected(selected === id ? null : id)
    reset()
  }

  const handleDownload = () => {
    if (!selected) {
      return
    }

    mutate({
      release_id: selected,
      ...(isRipper && audioOnly && { audio_only: true }),
    })
  }

  const allFailed = allSettled && statuses.every((s) => s.error)

  return (
    <div className="mt-6 pb-28">
      <IndexerStatusBar statuses={statuses} />

      {allFailed && statuses.length > 0 ? (
        <CenteredMessage
          icon={<AlertCircle className="size-8 text-destructive" />}
          title="All indexers failed"
          description="Could not reach any configured indexer."
        />
      ) : allSettled && releases.length === 0 ? (
        <CenteredMessage
          icon={<SearchX className="size-8 text-muted-foreground" />}
          title="No releases found"
          description="No torrents were found across the configured indexers."
        />
      ) : (
        <div className="mt-4 space-y-2">
          {releases.map((release) => (
            <ReleaseRow
              key={release.id}
              release={release}
              selected={selected === release.id}
              onSelect={() => handleSelect(release.id)}
            />
          ))}
        </div>
      )}

      <ActionBar
        release={selectedRelease ?? null}
        isRipper={isRipper}
        audioOnly={audioOnly}
        onAudioOnlyChange={setAudioOnly}
        isPending={isPending}
        isSuccess={isSuccess}
        onDownload={handleDownload}
      />

      {toast && (
        <Toast message={toast.message} type={toast.type} code={toast.code} />
      )}
    </div>
  )
}

interface IndexerStatus {
  name: string
  loading: boolean
  error: boolean
  count: number
}

function IndexerStatusBar(props: { statuses: IndexerStatus[] }) {
  if (props.statuses.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.statuses.map((s) => (
        <span
          key={s.name}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border',
            s.error
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : s.loading
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-white/10 bg-white/5 text-muted-foreground'
          )}
        >
          {s.name}
          <span className="font-bold">
            {s.loading ? (
              <Loader2 className="size-3 inline animate-spin" />
            ) : s.error ? (
              <AlertTriangle className="size-3 inline" />
            ) : (
              s.count
            )}
          </span>
        </span>
      ))}
    </div>
  )
}

function CenteredMessage(props: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[30vh] gap-3 text-center mt-4">
      <div className="rounded-2xl border border-white/10 bg-muted/50 p-5">
        {props.icon}
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium">{props.title}</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          {props.description}
        </p>
      </div>
    </div>
  )
}
