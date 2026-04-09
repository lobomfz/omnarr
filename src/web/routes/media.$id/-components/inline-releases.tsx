import { X } from 'lucide-react'
import { Suspense, useState } from 'react'

import { ReleasesSection } from '@/web/components/releases/releases-section'
import { ReleasesSkeleton } from '@/web/components/releases/releases-skeleton'
import type { MediaInfo } from '@/web/types/library'

export function InlineReleases(props: {
  media: MediaInfo
  onDismiss: () => void
}) {
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>()

  return (
    <div
      data-component="inline-releases"
      className="mb-8 rounded-xl glass-liquid p-4 sm:p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Releases</h2>
        <button
          onClick={props.onDismiss}
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors duration-[var(--duration-fast)] text-muted-foreground hover:text-white cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>

      {props.media.media_type === 'tv' && props.media.seasons.length > 0 && (
        <div className="mb-4">
          <select
            data-slot="season-picker"
            value={selectedSeason ?? ''}
            onChange={(e) =>
              setSelectedSeason(
                e.target.value ? Number(e.target.value) : undefined
              )
            }
            className="rounded-lg bg-card px-3 py-2 text-sm text-foreground border border-white/10 outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
          >
            <option value="">Select season...</option>
            {props.media.seasons.map((s) => (
              <option key={s.season_number} value={s.season_number}>
                {s.title ?? `Season ${s.season_number}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {props.media.media_type === 'tv' && selectedSeason == null ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Select a season to view releases.
        </p>
      ) : (
        <Suspense key={selectedSeason ?? 'all'} fallback={<ReleasesSkeleton />}>
          <ReleasesSection
            tmdb_id={props.media.tmdb_id}
            media_type={props.media.media_type}
            title={props.media.title}
            season_number={selectedSeason}
          />
        </Suspense>
      )}
    </div>
  )
}
