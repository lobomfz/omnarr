import { Link } from '@tanstack/react-router'
import { ChevronDown, Play, Plus, Star } from 'lucide-react'

import { HeroBackdrop } from '@/web/components/hero-backdrop'
import { PosterImage } from '@/web/components/poster-image'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/web/components/ui/popover'
import { cn } from '@/web/lib/cn'
import type { MediaInfo } from '@/web/types/library'

import type { Track, TrackSelection } from '../-utils/use-track-selection'
import { HeroTrackChips } from './hero-track-chips'

type Season = MediaInfo['seasons'][number]

export function Hero(props: {
  media: MediaInfo
  selectedSeason?: number
  selectedEpisode?: number
  watchParams?: { video: number; audio: number; sub?: number }
  tracks: Track[]
  selection: TrackSelection
  onSelect: (season: number | undefined, episode: number | undefined) => void
}) {
  const isTv = props.media.media_type === 'tv'
  const totalEps = props.media.seasons.reduce(
    (a, s) => a + s.episodes.length,
    0
  )
  const inLibrary = props.media.seasons.reduce(
    (a, s) => a + s.episodes.filter((e) => e.files.length > 0).length,
    0
  )

  const currentEpTitle = selectedEpisodeTitle(
    props.media,
    props.selectedSeason,
    props.selectedEpisode
  )

  return (
    <HeroBackdrop backdropPath={props.media.backdrop_path} animated>
      <div
        data-component="media-hero"
        data-media-id={props.media.id}
        className="flex gap-5 md:gap-6 max-w-5xl mx-auto w-full"
      >
        <div className="w-28 sm:w-32 md:w-36 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl shadow-black/60">
          <PosterImage
            posterPath={props.media.poster_path}
            title={props.media.title}
            className="aspect-[2/3]"
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-end">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            {props.media.title}
          </h1>

          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-white/70">
            {props.media.year && <span>{props.media.year}</span>}
            {!!props.media.vote_average && (
              <>
                <Dot />
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3 fill-warning stroke-warning" />
                  {props.media.vote_average.toFixed(1)}
                </span>
              </>
            )}
            {isTv && (
              <>
                <Dot />
                <span>
                  {props.media.seasons.length} Seasons · {totalEps} Eps
                </span>
              </>
            )}
            {!!props.media.added_at && inLibrary > 0 && (
              <>
                <Dot />
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-success shadow-[0_0_6px_var(--color-success)]" />
                  {inLibrary} in library
                </span>
              </>
            )}
          </div>

          {!!props.media.genres?.length && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {props.media.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-white/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-white/80 border border-white/5"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {props.media.overview && (
            <p className="text-sm text-white/65 leading-relaxed line-clamp-2 mt-3 hidden sm:block max-w-2xl">
              {props.media.overview}
            </p>
          )}

          {!!props.media.added_at && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mt-5">
              <WatchCta
                mediaId={props.media.id}
                watchParams={props.watchParams}
                isTv={isTv}
                seasons={props.media.seasons}
                selectedSeason={props.selectedSeason}
                selectedEpisode={props.selectedEpisode}
                currentEpTitle={currentEpTitle}
                onSelect={props.onSelect}
              />

              {props.tracks.length > 0 && (
                <HeroTrackChips
                  tracks={props.tracks}
                  selection={props.selection}
                />
              )}

              <button
                type="button"
                data-slot="add-release"
                className="inline-flex items-center gap-2 rounded-full bg-white/[0.10] text-white border border-white/[0.18] px-4 py-[11px] text-[13px] font-medium cursor-pointer backdrop-blur-md hover:bg-white/15 transition-colors ml-auto"
              >
                <Plus className="size-3.5" /> Add release
              </button>
            </div>
          )}
        </div>
      </div>
    </HeroBackdrop>
  )
}

function WatchCta(props: {
  mediaId: string
  watchParams?: { video: number; audio: number; sub?: number }
  isTv: boolean
  seasons: Season[]
  selectedSeason?: number
  selectedEpisode?: number
  currentEpTitle: string | null | undefined
  onSelect: (season: number | undefined, episode: number | undefined) => void
}) {
  const label = props.isTv
    ? episodeLabel(
        props.selectedSeason,
        props.selectedEpisode,
        props.currentEpTitle
      )
    : 'Play now'

  const playable = props.watchParams != null

  const playDot = (
    <span className="flex items-center justify-center size-8 rounded-full bg-black text-white">
      <Play className="size-3 fill-current" />
    </span>
  )

  const inner = (
    <span className="inline-flex items-center gap-2.5 pl-1 pr-3.5 py-1 bg-transparent cursor-pointer rounded-full">
      {playDot}
      <span className="text-left">
        <span className="block font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-neutral-500 leading-none">
          Watch
        </span>
        <span className="block text-sm font-bold tracking-tight leading-[1.2] mt-0.5">
          {label}
        </span>
      </span>
    </span>
  )

  const season = props.seasons.find(
    (s) => s.season_number === props.selectedSeason
  )

  return (
    <Popover>
      <PopoverAnchor asChild>
        <div
          data-slot="watch-cta"
          data-playable={String(playable)}
          className={cn(
            'flex items-stretch bg-white/90 text-black rounded-full p-1 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.7)]',
            !playable && 'opacity-60'
          )}
        >
          {!!props.watchParams && (
            <Link
              to="/media/$id/play"
              params={{ id: props.mediaId }}
              search={props.watchParams}
              className="contents"
            >
              {inner}
            </Link>
          )}
          {!props.watchParams && (
            <button
              type="button"
              disabled
              className="contents cursor-not-allowed"
            >
              {inner}
            </button>
          )}

          {props.isTv && (
            <>
              <span className="w-px bg-black/10 my-2" />
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Choose episode"
                  data-slot="episode-picker-trigger"
                  className="w-9 flex items-center justify-center text-black cursor-pointer rounded-r-full hover:bg-black/5 transition-colors"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </PopoverTrigger>
            </>
          )}
        </div>
      </PopoverAnchor>
      {props.isTv && (
        <PopoverContent align="start" className="w-[420px] h-[440px] flex">
          <div className="w-[120px] flex-shrink-0 border-r border-white/10 overflow-y-auto scrollbar-none">
            {props.seasons.map((s) => {
              const active = s.season_number === props.selectedSeason
              const downloaded = s.episodes.filter(
                (e) => e.files.length > 0
              ).length
              const disabled = downloaded === 0
              return (
                <button
                  key={s.season_number}
                  type="button"
                  data-slot="season-option"
                  data-season-number={s.season_number}
                  data-selected={String(active)}
                  data-disabled={String(disabled)}
                  disabled={disabled}
                  onClick={() => {
                    const firstPlayable = s.episodes.find(
                      (e) => e.files.length > 0
                    )
                    props.onSelect(
                      s.season_number,
                      firstPlayable?.episode_number
                    )
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left flex items-center justify-between text-xs font-medium transition-colors',
                    disabled && 'opacity-40 cursor-not-allowed',
                    !disabled && 'cursor-pointer',
                    active && 'bg-primary/15 text-primary',
                    !active &&
                      !disabled &&
                      'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                    !active && disabled && 'text-muted-foreground'
                  )}
                >
                  <span className="font-mono tracking-[0.04em]">
                    S{String(s.season_number).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-fg-dim">
                    {downloaded}/{s.episodes.length}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-none">
            {season?.episodes.map((e) => {
              const active = e.episode_number === props.selectedEpisode
              const disabled = e.files.length === 0
              return (
                <button
                  key={e.episode_number}
                  type="button"
                  data-slot="episode-option"
                  data-episode-number={e.episode_number}
                  data-selected={String(active)}
                  data-disabled={String(disabled)}
                  disabled={disabled}
                  onClick={() =>
                    props.onSelect(props.selectedSeason, e.episode_number)
                  }
                  className={cn(
                    'w-full px-3 py-2 text-left flex items-center gap-3 text-xs transition-colors',
                    disabled && 'opacity-40 cursor-not-allowed',
                    !disabled && 'cursor-pointer',
                    active && 'bg-primary/15 text-primary',
                    !active && !disabled && 'text-foreground hover:bg-white/5',
                    !active && disabled && 'text-muted-foreground'
                  )}
                >
                  <span className="font-mono text-[10px] w-8 flex-shrink-0 text-fg-dim">
                    E{String(e.episode_number).padStart(2, '0')}
                  </span>
                  <span className="truncate">{e.title ?? 'Untitled'}</span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      )}
    </Popover>
  )
}

function Dot() {
  return <span className="size-1 rounded-full bg-white/40" />
}

function episodeLabel(
  season: number | undefined,
  episode: number | undefined,
  title: string | null | undefined
) {
  if (season == null || episode == null) {
    return 'Pick episode'
  }

  const sTag = `S${String(season).padStart(2, '0')}`
  const eTag = `E${String(episode).padStart(2, '0')}`

  return title ? `${sTag} · ${eTag} · ${title}` : `${sTag} · ${eTag}`
}

function selectedEpisodeTitle(
  media: MediaInfo,
  season: number | undefined,
  episode: number | undefined
) {
  if (season == null || episode == null) {
    return
  }

  return media.seasons
    .find((s) => s.season_number === season)
    ?.episodes.find((e) => e.episode_number === episode)?.title
}
