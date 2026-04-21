import { ORPCError } from '@orpc/client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { SearchX } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'

import { orpc } from '@/web/client'
import { ReleasesSection } from '@/web/components/releases/releases-section'
import type { MediaInfo } from '@/web/types/library'

import { DownloadsSection } from './-components/downloads-section'
import { Hero } from './-components/hero'
import { PageSkeleton } from './-components/page-skeleton'
import { TrackSelector } from './-components/track-selector'
import { useTrackSelection } from './-utils/use-track-selection'

export const Route = createFileRoute('/media/$id/')({
  component: MediaPage,
  errorComponent: MediaError,
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

function firstEpisodeOf(data: MediaInfo, seasonNumber: number | undefined) {
  if (seasonNumber == null) {
    return
  }

  const season = data.seasons.find((s) => s.season_number === seasonNumber)

  return season?.episodes[0]?.episode_number
}

function MediaContent(props: { id: string }) {
  const { data } = useMediaInfo(props.id)
  const initialSeason =
    data.media_type === 'tv'
      ? data.seasons.find((s) => s.season_number === 1)?.season_number
      : undefined

  const [selectedSeason, setSelectedSeason] = useState(initialSeason)
  const [selectedEpisode, setSelectedEpisode] = useState(() =>
    firstEpisodeOf(data, initialSeason)
  )

  const tracks = useMemo(
    () => collectTracks(data, selectedSeason, selectedEpisode),
    [data, selectedSeason, selectedEpisode]
  )
  const selection = useTrackSelection(tracks)

  const watchParams =
    selection.video != null && selection.audio != null
      ? {
          video: selection.video,
          audio: selection.audio,
          sub: selection.subtitle,
        }
      : undefined

  return (
    <>
      <Hero media={data} watchParams={watchParams} />

      <div className="max-w-5xl mx-auto pt-6 pb-8 space-y-6">
        {data.media_type === 'tv' && data.seasons.length > 0 && (
          <div className="flex items-center gap-3">
            <SeasonPicker
              seasons={data.seasons}
              value={selectedSeason}
              onChange={(v) => {
                setSelectedSeason(v)
                setSelectedEpisode(firstEpisodeOf(data, v))
              }}
            />

            {selectedSeason != null && (
              <EpisodePicker
                episodes={
                  data.seasons.find((s) => s.season_number === selectedSeason)
                    ?.episodes ?? []
                }
                value={selectedEpisode}
                onChange={setSelectedEpisode}
              />
            )}
          </div>
        )}

        {!!data.added_at && (
          <TrackSelector tracks={tracks} selection={selection} />
        )}

        {!!data.added_at && (
          <DownloadsSection media={data} seasonNumber={selectedSeason} />
        )}

        {data.media_type === 'tv' && selectedSeason == null ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            Select a season to view releases.
          </p>
        ) : (
          <ReleasesSection
            tmdb_id={data.tmdb_id}
            media_type={data.media_type}
            title={data.title}
            season_number={selectedSeason}
          />
        )}
      </div>
    </>
  )
}

type Track = MediaInfo['downloads'][number]['files'][number]['tracks'][number]

function collectTracks(
  data: MediaInfo,
  selectedSeason?: number,
  selectedEpisode?: number
): Track[] {
  if (data.media_type === 'tv') {
    if (selectedSeason == null || selectedEpisode == null) {
      return []
    }

    const season = data.seasons.find((s) => s.season_number === selectedSeason)
    const episode = season?.episodes.find(
      (e) => e.episode_number === selectedEpisode
    )

    if (!episode) {
      return []
    }

    return episode.files.flatMap((f) => f.tracks)
  }

  return data.downloads.flatMap((d) => d.files.flatMap((f) => f.tracks))
}

function SeasonPicker(props: {
  seasons: MediaInfo['seasons']
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <select
      data-component="season-picker"
      value={props.value ?? ''}
      onChange={(e) =>
        props.onChange(e.target.value ? Number(e.target.value) : undefined)
      }
      className="rounded-lg bg-card px-3 py-2 text-sm text-foreground border border-white/10 outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
    >
      <option value="">Select season...</option>
      {props.seasons.map((s) => (
        <option key={s.season_number} value={s.season_number}>
          {s.title ?? `Season ${s.season_number}`}
        </option>
      ))}
    </select>
  )
}

type Episode = MediaInfo['seasons'][number]['episodes'][number]

function EpisodePicker(props: {
  episodes: Episode[]
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <select
      data-component="episode-picker"
      value={props.value ?? ''}
      onChange={(e) =>
        props.onChange(e.target.value ? Number(e.target.value) : undefined)
      }
      className="rounded-lg bg-card px-3 py-2 text-sm text-foreground border border-white/10 outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
    >
      <option value="">Select episode...</option>
      {props.episodes.map((e) => (
        <option key={e.episode_number} value={e.episode_number}>
          {e.title ?? `Episode ${e.episode_number}`}
        </option>
      ))}
    </select>
  )
}

function MediaError({ error }: ErrorComponentProps) {
  const router = useRouter()

  if (error instanceof ORPCError && error.code === 'SEARCH_RESULT_NOT_FOUND') {
    return (
      <div
        data-component="media-not-found"
        className="flex flex-col items-center justify-center gap-4 py-32 text-muted-foreground"
      >
        <SearchX className="size-12" />
        <p className="text-lg">Media not found</p>
        <button
          type="button"
          onClick={() => router.history.back()}
          className="text-sm text-primary hover:underline"
        >
          Go back
        </button>
      </div>
    )
  }

  throw error
}
