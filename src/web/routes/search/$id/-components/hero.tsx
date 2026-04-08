import { HeroBackdrop } from '@/web/components/hero-backdrop'
import { PosterImage } from '@/web/components/poster-image'
import type { TmdbInfo } from '@/web/types/tmdb'

export function Hero(props: { info: TmdbInfo }) {
  return (
    <HeroBackdrop backdropPath={props.info.backdrop_path}>
      <div className="flex gap-5 md:gap-6 max-w-5xl mx-auto w-full">
        <div className="w-28 sm:w-32 md:w-36 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl shadow-black/60">
          <PosterImage
            posterPath={props.info.poster_path}
            title={props.info.title}
            className="aspect-[2/3]"
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-end">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            {props.info.title}
          </h1>

          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-white/70">
            {props.info.year && <span>{props.info.year}</span>}
            {props.info.runtime && (
              <>
                <Dot />
                <span>{props.info.runtime} min</span>
              </>
            )}
            {props.info.vote_average != null && props.info.vote_average > 0 && (
              <>
                <Dot />
                <span>{props.info.vote_average.toFixed(1)}</span>
              </>
            )}
          </div>

          {props.info.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {props.info.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/80 border border-white/5"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {props.info.overview && (
            <p className="text-sm text-white/60 leading-relaxed line-clamp-2 mt-3 hidden sm:block">
              {props.info.overview}
            </p>
          )}
        </div>
      </div>
    </HeroBackdrop>
  )
}

function Dot() {
  return <span className="size-1 rounded-full bg-white/40" />
}
