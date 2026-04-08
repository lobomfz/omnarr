import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense, useState } from 'react'

import { orpc } from '@/web/client'

import { DownloadsSection } from './-components/downloads-section'
import { InlineReleases } from './-components/inline-releases'
import { MediaHero } from './-components/media-hero'
import { PageSkeleton } from './-components/page-skeleton'

export const Route = createFileRoute('/media/$id')({
  component: MediaPage,
})

function MediaPage() {
  const { id } = Route.useParams()

  return (
    <Suspense fallback={<PageSkeleton />}>
      <MediaContent id={id} />
    </Suspense>
  )
}

function useMediaInfo(id: string) {
  return useSuspenseQuery(orpc.library.getInfo.queryOptions({ input: { id } }))
}

function MediaContent(props: { id: string }) {
  const { data } = useMediaInfo(props.id)
  const [showReleases, setShowReleases] = useState(false)

  return (
    <>
      <MediaHero
        media={data}
        onAddRelease={() => setShowReleases(!showReleases)}
      />

      <div className="max-w-5xl mx-auto pt-6 pb-8">
        {showReleases && (
          <InlineReleases
            media={data}
            onDismiss={() => setShowReleases(false)}
          />
        )}

        <DownloadsSection media={data} />
      </div>
    </>
  )
}
