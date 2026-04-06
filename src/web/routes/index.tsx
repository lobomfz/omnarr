import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { orpc } from '@/web/client'
import { EmptyState } from '@/web/components/empty-state'
import { MediaCard } from '@/web/components/media-card'

export const Route = createFileRoute('/')({
  component: LibraryPage,
})

function useLibrary() {
  return useSuspenseQuery(orpc.library.list.queryOptions({ input: {} }))
}

function LibraryPage() {
  return (
    <div className="pt-8 md:pt-12">
      <Suspense fallback={<GridSkeleton />}>
        <LibraryGrid />
      </Suspense>
    </div>
  )
}

function LibraryGrid() {
  const { data } = useLibrary()

  if (data.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {data.map((media) => (
        <MediaCard key={media.id} media={media} />
      ))}
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse"
        />
      ))}
    </div>
  )
}
