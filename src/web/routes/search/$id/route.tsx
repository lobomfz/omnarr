import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense, useState } from 'react'

import { orpc } from '@/web/client'
import { QueryErrorFallback } from '@/web/components/query-error-boundary'
import { ReleasesSection } from '@/web/components/releases/releases-section'

import { Hero } from './-components/hero'
import { PageSkeleton } from './-components/page-skeleton'

export const Route = createFileRoute('/search/$id')({
  component: SearchDetailPage,
  errorComponent: ({ error }) => <QueryErrorFallback error={error} />,
})

function useTmdbInfo(id: string) {
  return useSuspenseQuery(orpc.tmdb.getInfo.queryOptions({ input: { id } }))
}

function SearchDetailPage() {
  const { id } = Route.useParams()

  return (
    <Suspense fallback={<PageSkeleton />}>
      <SearchDetailContent id={id} />
    </Suspense>
  )
}

function SearchDetailContent(props: { id: string }) {
  const { data: info } = useTmdbInfo(props.id)

  const [selectedSeason, setSelectedSeason] = useState<number | undefined>()

  return (
    <>
      <Hero info={info} />

      <div className="max-w-5xl mx-auto pt-6">
        {info.media_type === 'tv' && info.seasons.length > 0 && (
          <div className="mb-4">
            <select
              value={selectedSeason ?? ''}
              onChange={(e) =>
                setSelectedSeason(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
              className="rounded-lg bg-card px-3 py-2 text-sm text-foreground border border-white/10 outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
            >
              <option value="">Select season...</option>
              {info.seasons.map((s) => (
                <option key={s.season_number} value={s.season_number}>
                  {s.title ?? `Season ${s.season_number}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {info.media_type === 'tv' && selectedSeason == null ? (
          <div className="flex flex-col items-center justify-center min-h-[30vh] gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Select a season to view releases.
            </p>
          </div>
        ) : (
          <ReleasesSection
            key={selectedSeason ?? 'all'}
            tmdb_id={info.tmdb_id}
            media_type={info.media_type}
            title={info.title}
            season_number={selectedSeason}
          />
        )}
      </div>
    </>
  )
}
