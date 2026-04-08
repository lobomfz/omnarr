import { useDebouncedValue } from '@tanstack/react-pacer'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Check, Search } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'

import type { media_type } from '@/db/connection'
import { orpc, type RouterOutputs } from '@/web/client'
import { PosterImage } from '@/web/components/poster-image'

export const Route = createFileRoute('/search/')({
  component: SearchPage,
})

type SearchItem = RouterOutputs['tmdb']['search'][number]

function useSearchResults(query: string) {
  return useQuery(
    orpc.tmdb.search.queryOptions({
      input: { query },
      enabled: query.length >= 3,
    })
  )
}

function useLibrary() {
  return useSuspenseQuery(orpc.library.list.queryOptions({ input: {} }))
}

function SearchPage() {
  const [query, setQuery] = useState('')
  const [debounced] = useDebouncedValue(query, { wait: 400 })

  const { data, isLoading } = useSearchResults(debounced)

  return (
    <div className="pt-8 md:pt-12">
      <div className="mx-auto max-w-2xl mb-10">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies and TV shows..."
            autoFocus
            className="w-full rounded-full glass-liquid pl-12 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/50 transition-shadow duration-[var(--duration-fast)]"
          />
        </div>
      </div>

      <Suspense fallback={<ResultsSkeleton />}>
        <SearchResults query={debounced} data={data} isLoading={isLoading} />
      </Suspense>
    </div>
  )
}

function SearchResults(props: {
  query: string
  data: SearchItem[] | undefined
  isLoading: boolean
}) {
  const { data: library } = useLibrary()

  const libraryIds = useMemo(() => new Set(library.map((m) => m.id)), [library])

  if (props.query.length < 3) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-muted-foreground">
          Type a search to find movies and TV shows.
        </p>
      </div>
    )
  }

  if (props.isLoading) {
    return <ResultsSkeleton />
  }

  if (!props.data || props.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-lg font-medium">No results</p>
        <p className="text-sm text-muted-foreground mt-1">
          Nothing matched "{props.query}"
        </p>
      </div>
    )
  }

  const [bestMatch, ...rest] = props.data

  return (
    <div className="space-y-10">
      <BestMatch item={bestMatch} libraryIds={libraryIds} />
      {rest.length > 0 && (
        <ResultsCarousel items={rest} libraryIds={libraryIds} />
      )}
    </div>
  )
}

const TYPE_LABEL: Record<media_type, string> = {
  movie: 'Movie',
  tv: 'TV Show',
}

function BestMatch(props: { item: SearchItem; libraryIds: Set<string> }) {
  const inLibrary = props.libraryIds.has(props.item.id)

  return (
    <div className="flex gap-6 md:gap-8">
      <div className="w-40 sm:w-48 md:w-56 flex-shrink-0">
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-card shadow-elevation-1">
          <PosterImage
            posterPath={props.item.poster_path}
            title={props.item.title}
            className="h-full w-full"
          />

          {inLibrary && <LibraryCheck />}
        </div>
      </div>

      <div className="flex-1 min-w-0 py-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            {TYPE_LABEL[props.item.media_type]}
          </span>
          {props.item.year && (
            <span className="text-sm text-muted-foreground">
              {props.item.year}
            </span>
          )}
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          {props.item.title}
        </h2>

        {props.item.overview && (
          <p className="text-sm text-white/70 leading-relaxed line-clamp-4 mb-6">
            {props.item.overview}
          </p>
        )}

        <Link
          to={inLibrary ? '/media/$id' : '/search/$id'}
          params={{ id: props.item.id }}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold backdrop-blur-sm transition-colors duration-[var(--duration-fast)] hover:bg-white/20"
        >
          Open
        </Link>
      </div>
    </div>
  )
}

function ResultsCarousel(props: {
  items: SearchItem[]
  libraryIds: Set<string>
}) {
  const navigate = useNavigate()

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-4">
        Other results
      </h3>
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 scrollbar-none">
        {props.items.map((item) => {
          const inLibrary = props.libraryIds.has(item.id)

          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                navigate({
                  to: inLibrary ? '/media/$id' : '/search/$id',
                  params: { id: item.id },
                })
              }
              className="group flex-shrink-0 w-32 sm:w-36 cursor-pointer text-left"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-card shadow-elevation-1 transition-all duration-[var(--duration-normal)] ease-[var(--ease-apple)] group-hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] group-hover:ring-1 group-hover:ring-inset group-hover:ring-white/10 group-hover:-translate-y-1 group-hover:scale-[1.01]">
                <PosterImage
                  posterPath={item.poster_path}
                  title={item.title}
                  className="h-full w-full"
                />

                {inLibrary && <LibraryCheck />}
              </div>

              <div className="mt-2 px-0.5">
                <p className="text-sm font-medium text-foreground line-clamp-1">
                  {item.title}
                </p>
                <p className="text-xs text-muted-foreground">{item.year}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LibraryCheck() {
  return (
    <div className="absolute top-2 right-2">
      <div className="size-5 rounded-full bg-emerald-500/90 flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.6)]">
        <Check className="size-3 text-white" strokeWidth={3} />
      </div>
    </div>
  )
}

function ResultsSkeleton() {
  return (
    <div className="space-y-10">
      <div className="flex gap-6 md:gap-8">
        <div className="w-40 sm:w-48 md:w-56 flex-shrink-0">
          <div className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
        </div>
        <div className="flex-1 py-2 space-y-3">
          <div className="h-4 w-20 rounded bg-white/5 animate-pulse" />
          <div className="h-8 w-2/3 rounded bg-white/5 animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-white/5 animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-white/5 animate-pulse" />
          </div>
          <div className="h-10 w-24 rounded-full bg-white/5 animate-pulse" />
        </div>
      </div>

      <div>
        <div className="h-4 w-24 rounded bg-white/5 animate-pulse mb-4" />
        <div className="flex gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex-shrink-0 w-32 sm:w-36">
              <div className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
              <div className="mt-2 space-y-1.5 px-0.5">
                <div className="h-4 w-3/4 rounded bg-white/5 animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-white/5 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
