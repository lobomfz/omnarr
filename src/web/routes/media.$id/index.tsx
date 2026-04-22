import { ORPCError } from '@orpc/client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { type } from 'arktype'
import { SearchX } from 'lucide-react'
import { Suspense, useCallback, useMemo } from 'react'

import { orpc } from '@/web/client'
import { ReleasesSection } from '@/web/components/releases/releases-section'
import type { MediaInfo } from '@/web/types/library'

import { EpisodeDetail } from './-components/episode-detail'
import { EpisodeList } from './-components/episode-list'
import { Hero } from './-components/hero'
import { LibraryOverview } from './-components/library-overview'
import { PageSkeleton } from './-components/page-skeleton'
import { SeasonRibbon } from './-components/season-ribbon'
import {
  useScanFileProgress,
  useScanProgress,
} from './-utils/use-scan-progress'
import { useTrackSelection } from './-utils/use-track-selection'

const searchSchema = type({
  'season?': 'number.integer',
  'episode?': 'number.integer',
  'video?': 'number.integer',
  'audio?': 'number.integer',
  'sub?': 'number.integer',
})

export const Route = createFileRoute('/media/$id/')({
  component: MediaPage,
  errorComponent: MediaError,
  validateSearch: (search) => searchSchema.assert(search),
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
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const isTv = data.media_type === 'tv'

  const defaultSeason = isTv
    ? (data.seasons.find((s) => s.season_number === 1)?.season_number ??
      data.seasons[0]?.season_number)
    : undefined

  const selectedSeason = isTv
    ? (data.seasons.find((s) => s.season_number === search.season)
        ?.season_number ?? defaultSeason)
    : undefined

  const selectedEpisode = isTv
    ? (data.seasons
        .find((s) => s.season_number === selectedSeason)
        ?.episodes.find((e) => e.episode_number === search.episode)
        ?.episode_number ?? firstEpisodeOf(data, selectedSeason))
    : undefined

  const updateSelection = useCallback(
    (next: { season?: number; episode?: number }) => {
      void navigate({ search: next, replace: true })
    },
    [navigate]
  )

  const updateTrack = useCallback(
    (patch: { video?: number; audio?: number; sub?: number }) => {
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
      })
    },
    [navigate]
  )

  const scanProgress = useScanProgress(data.id, data.active_scan)
  const scanFileProgress = useScanFileProgress(
    data.id,
    scanProgress?.path,
    data.active_scan
  )

  const scanningPaths = useMemo(
    () =>
      scanProgress?.path ? new Set([scanProgress.path]) : new Set<string>(),
    [scanProgress?.path]
  )

  const downloadingSeasons = useMemo(
    () =>
      new Set(
        data.downloads
          .filter((d) => d.status === 'downloading' && d.season_number != null)
          .map((d) => d.season_number as number)
      ),
    [data.downloads]
  )

  const selectedSeasonData = useMemo(
    () => data.seasons.find((s) => s.season_number === selectedSeason),
    [data.seasons, selectedSeason]
  )

  const selectedEpisodeData = useMemo(
    () =>
      selectedSeasonData?.episodes.find(
        (e) => e.episode_number === selectedEpisode
      ),
    [selectedSeasonData, selectedEpisode]
  )

  const tracks = useMemo(
    () => collectTracks(data, selectedSeason, selectedEpisode),
    [data, selectedSeason, selectedEpisode]
  )
  const selection = useTrackSelection(
    tracks,
    { video: search.video, audio: search.audio, sub: search.sub },
    updateTrack
  )

  const watchParams =
    selection.video != null && selection.audio != null
      ? {
          video: selection.video,
          audio: selection.audio,
          sub: selection.subtitle,
        }
      : undefined

  const onHeroSelect = (
    season: number | undefined,
    episode: number | undefined
  ) => {
    updateSelection({ season, episode })
  }

  return (
    <>
      <Hero
        media={data}
        selectedSeason={selectedSeason}
        selectedEpisode={selectedEpisode}
        watchParams={watchParams}
        tracks={tracks}
        selection={selection}
        onSelect={onHeroSelect}
      />

      <div className="max-w-5xl mx-auto px-4 pt-6 pb-12 space-y-8">
        {!!data.added_at && isTv && selectedSeasonData && (
          <section className="space-y-4">
            <SeasonRibbon
              seasons={data.seasons}
              downloadingSeasons={downloadingSeasons}
              selectedSeason={selectedSeason}
              onSelect={(s) =>
                updateSelection({
                  season: s,
                  episode: firstEpisodeOf(data, s),
                })
              }
            />

            <div className="grid grid-cols-[280px_1fr] gap-5">
              <EpisodeList
                episodes={selectedSeasonData.episodes}
                selectedEpisode={selectedEpisode}
                scanningPaths={scanningPaths}
                onSelect={(e) =>
                  updateSelection({ season: selectedSeason, episode: e })
                }
              />

              {!!selectedEpisodeData && (
                <EpisodeDetail
                  seasonNumber={selectedSeasonData.season_number}
                  episode={selectedEpisodeData}
                  downloads={data.downloads}
                  scanningPaths={scanningPaths}
                  selection={selection}
                />
              )}
              {!selectedEpisodeData && (
                <div className="bg-card border border-border rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
                  Pick an episode.
                </div>
              )}
            </div>
          </section>
        )}

        {!!data.added_at && !isTv && (
          <MovieSources
            media={data}
            scanningPaths={scanningPaths}
            selection={selection}
          />
        )}

        {!!data.added_at && (
          <LibraryOverview
            media={data}
            scanningPaths={scanningPaths}
            selection={selection}
          />
        )}

        {!!data.added_at && scanFileProgress?.current_step && (
          <div
            data-component="scan-step"
            className="font-mono text-[10px] text-fg-dim"
          >
            scanning · {scanFileProgress.current_step} ·{' '}
            {Math.round(scanFileProgress.ratio * 100)}%
          </div>
        )}

        {(isTv && selectedSeason == null) && (
          <p className="text-sm text-muted-foreground text-center py-12">
            Select a season to view releases.
          </p>
        )}
        {!(isTv && selectedSeason == null) && (
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

function MovieSources(props: {
  media: MediaInfo
  scanningPaths: Set<string>
  selection: ReturnType<typeof useTrackSelection>
}) {
  const files = props.media.downloads.flatMap((d) => d.files)

  if (files.length === 0) {
    return null
  }

  const download = props.media.downloads[0]

  const pseudoEpisode = {
    episode_number: 1,
    title: props.media.title,
    files: files.map((f) => ({ ...f, download_id: download.id })),
  }

  return (
    <EpisodeDetail
      seasonNumber={0}
      episode={pseudoEpisode}
      downloads={props.media.downloads}
      scanningPaths={props.scanningPaths}
      selection={props.selection}
    />
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
          data-slot="go-back"
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
