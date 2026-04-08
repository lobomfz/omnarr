import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { orpc } from '@/web/client'
import { EmptyState } from '@/web/components/empty-state'
import { MediaCard } from '@/web/components/media-card'
import type { MediaItem } from '@/web/types/library'

import { HeroSpotlight } from './-components/hero-spotlight'
import { PageSkeleton } from './-components/page-skeleton'

export const Route = createFileRoute('/')({
  component: LibraryPage,
})

function useLibrary() {
  return useSuspenseQuery(orpc.library.list.queryOptions({ input: {} }))
}

function LibraryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LibraryContent />
    </Suspense>
  )
}

function LibraryContent() {
  const { data } = useLibrary()

  if (data.length === 0) {
    return <EmptyState />
  }

  return (
    <>
      <HeroSpotlight />
      <div className="pt-8 md:pt-12">
        <LibraryGrid items={data} />
      </div>
    </>
  )
}

function LibraryGrid(props: { items: MediaItem[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 sm:gap-6">
      {props.items.map((media) => (
        <MediaCard key={media.id} media={media} />
      ))}
    </div>
  )
}
