import { Link } from '@tanstack/react-router'

import { PosterImage } from '@/web/components/poster-image'
import type { MediaItem } from '@/web/types/library'

export function MediaCard(props: { media: MediaItem }) {
  return (
    <Link
      to="/media/$id"
      params={{ id: props.media.id }}
      data-component="media-card"
      data-media-id={props.media.id}
      data-error-count={
        props.media.unread_error_count
          ? String(props.media.unread_error_count)
          : undefined
      }
      className="group block cursor-pointer"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-card shadow-elevation-1 transition-all duration-[var(--duration-normal)] ease-[var(--ease-apple)] group-hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] group-hover:ring-1 group-hover:ring-inset group-hover:ring-white/10 group-hover:-translate-y-1 group-hover:scale-[1.01]">
        <PosterImage
          posterPath={props.media.poster_path ?? null}
          title={props.media.title}
          className="size-full"
        />

        <StatusDot media={props.media} />

        {!!props.media.unread_error_count && <ErrorDot />}

        {props.media.download?.status === 'downloading' && (
          <DownloadBar progress={props.media.download.progress} />
        )}
      </div>

      <div className="mt-2 px-0.5">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-medium text-foreground line-clamp-1 flex-1 min-w-0">
            {props.media.title}
          </p>
          {props.media.download?.status === 'downloading' && (
            <span className="text-[11px] font-medium text-primary flex-shrink-0">
              {Math.round(props.media.download.progress * 100)}%
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {props.media.year}
          {props.media.media_type === 'tv' && !!props.media.total_episodes && (
            <span>
              {' · '}
              {props.media.episodes_with_files ?? 0}/
              {props.media.total_episodes} ep
            </span>
          )}
        </p>
      </div>
    </Link>
  )
}

function DownloadBar(props: { progress: number }) {
  const pct = Math.round(props.progress * 100)

  return (
    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10 overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function ErrorDot() {
  return (
    <div className="absolute top-2.5 right-2.5 z-10">
      <div className="size-2.5 rounded-full bg-destructive shadow-[0_0_12px_rgba(239,68,68,0.8)] ring-1 ring-black/20" />
    </div>
  )
}

function StatusDot(props: { media: MediaItem }) {
  const hasFiles = props.media.file_count > 0

  if (props.media.unread_error_count) {
    return null
  }

  return (
    <div className="absolute top-2.5 left-2.5">
      <div
        className={`size-2.5 rounded-full ring-1 ring-black/20 ${
          hasFiles
            ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
            : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]'
        }`}
      />
    </div>
  )
}
