import { Link } from '@tanstack/react-router'
import { Play } from 'lucide-react'

import { HeroBackdrop } from '@/web/components/hero-backdrop'
import { PosterImage } from '@/web/components/poster-image'
import type { MediaInfo } from '@/web/types/library'

export function Hero(props: {
  media: MediaInfo
  watchParams?: { video: number; audio: number; sub?: number }
}) {
  return (
    <HeroBackdrop backdropPath={props.media.backdrop_path}>
      <div
        data-component="media-hero"
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
            {props.media.runtime && (
              <>
                <Dot />
                <span>{props.media.runtime} min</span>
              </>
            )}
            {!!props.media.vote_average && (
              <>
                <Dot />
                <span>{props.media.vote_average.toFixed(1)}</span>
              </>
            )}
          </div>

          {!!props.media.genres?.length && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {props.media.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/80 border border-white/5"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {props.media.overview && (
            <p className="text-base text-white/60 leading-relaxed line-clamp-2 mt-3 hidden sm:block">
              {props.media.overview}
            </p>
          )}

          {!!props.media.added_at && (
            <div className="flex items-center gap-3 mt-4">
              {props.watchParams ? (
                <Link
                  to="/media/$id/play"
                  params={{ id: props.media.id }}
                  search={props.watchParams}
                  data-slot="watch-now"
                  className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
                >
                  <Play className="size-4 fill-current" />
                  Watch Now
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  data-slot="watch-now"
                  className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black opacity-50 cursor-not-allowed"
                >
                  <Play className="size-4 fill-current" />
                  Watch Now
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </HeroBackdrop>
  )
}

function Dot() {
  return <span className="size-1 rounded-full bg-white/40" />
}
