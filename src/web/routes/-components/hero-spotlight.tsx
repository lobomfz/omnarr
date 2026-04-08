import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Info, Play } from 'lucide-react'

import { orpc } from '@/web/client'
import { HeroBackdrop } from '@/web/components/hero-backdrop'

function useSpotlight() {
  return useSuspenseQuery(orpc.library.spotlight.queryOptions())
}

export function HeroSpotlight() {
  const { data } = useSpotlight()

  if (!data.row) {
    return null
  }

  return (
    <HeroBackdrop backdropPath={data.row.backdrop_path} animated>
      <div className="max-w-xl space-y-4">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight">
          {data.row.title}
        </h1>

        {data.row.overview && (
          <p className="text-sm sm:text-base text-white/70 line-clamp-2 leading-relaxed">
            {data.row.overview}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled
            className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black opacity-80 cursor-not-allowed"
          >
            <Play className="size-4 fill-current" />
            Watch Now
          </button>

          <Link
            to="/media/$id"
            params={{ id: data.row.id }}
            className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold backdrop-blur-sm transition-colors duration-[var(--duration-fast)] hover:bg-white/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Info className="size-4" />
            Details
          </Link>
        </div>
      </div>
    </HeroBackdrop>
  )
}
