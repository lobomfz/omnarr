import type { RouterOutputs } from '@/web/client'
import { PosterImage } from '@/web/components/poster-image'

type MediaItem = RouterOutputs['library']['list'][number]

export function MediaCard(props: { media: MediaItem }) {
  return (
    <div className="group relative rounded-xl bg-card shadow-elevation-1 transition-all duration-[var(--duration-normal)] ease-[var(--ease-apple)] hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:ring-1 hover:ring-inset hover:ring-white/10 hover:-translate-y-1 hover:scale-[1.01] cursor-pointer">
      <div className="aspect-[2/3] overflow-hidden rounded-xl shadow-inner">
        <PosterImage
          posterPath={props.media.poster_path ?? null}
          title={props.media.title}
          className="h-full w-full"
        />

        <div className="absolute inset-0 rounded-xl bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-[var(--duration-normal)] ease-[var(--ease-apple)] group-hover:opacity-100" />

        <div className="absolute inset-0 rounded-xl bg-linear-to-tr from-white/10 to-transparent mix-blend-overlay opacity-0 transition-opacity duration-[var(--duration-normal)] ease-[var(--ease-apple)] group-hover:opacity-100" />

        <div className="absolute top-2 left-2 opacity-0 transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-apple)] group-hover:opacity-100">
          {props.media.year && (
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-md border border-white/10">
              {props.media.year}
            </span>
          )}
        </div>

        <StatusDot media={props.media} />

        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 transition-all duration-[var(--duration-normal)] ease-[var(--ease-apple)] group-hover:translate-y-0 group-hover:opacity-100">
          <p className="text-xs font-medium text-white/90 line-clamp-2">
            {props.media.title}
          </p>
        </div>
      </div>
    </div>
  )
}

function StatusDot(props: { media: MediaItem }) {
  const hasFiles = props.media.file_count > 0

  return (
    <div className="absolute top-2 right-2 opacity-0 transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-apple)] group-hover:opacity-100">
      <div
        className={`h-2 w-2 rounded-full ring-1 ring-black/10 ${
          hasFiles
            ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]'
            : 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.8)]'
        }`}
      />
    </div>
  )
}
