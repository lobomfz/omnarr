import { Loader2 } from 'lucide-react'

import { Formatters } from '@/lib/formatters'
import { cn } from '@/web/lib/cn'
import type { MediaInfo } from '@/web/types/library'

type Episode = MediaInfo['seasons'][number]['episodes'][number]
type EpisodeStatus = 'ready' | 'scanning' | 'downloaded' | 'missing'

export function EpisodeList(props: {
  episodes: Episode[]
  selectedEpisode: number | undefined
  scanningPaths: Set<string>
  onSelect: (episodeNumber: number) => void
}) {
  return (
    <div
      data-component="episode-list"
      className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col self-start max-h-[640px] sticky top-4"
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-dim">
          Episodes
        </span>
        <span className="font-mono text-[10px] text-fg-dim">
          {props.episodes.length}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
        {props.episodes.map((e) => {
          const selected = e.episode_number === props.selectedEpisode
          const status = computeStatus(e, props.scanningPaths)

          return (
            <button
              key={e.episode_number}
              type="button"
              data-slot="episode-row"
              data-episode-number={e.episode_number}
              data-selected={String(selected)}
              data-status={status}
              onClick={() => props.onSelect(e.episode_number)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors border-b border-border/50 last:border-b-0',
                selected
                  ? 'bg-primary/10'
                  : 'hover:bg-white/[0.03] text-foreground'
              )}
            >
              <StatusDot status={status} />
              <span className="font-mono text-[11px] w-8 flex-shrink-0 text-fg-dim">
                E{String(e.episode_number).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    'text-xs font-medium truncate',
                    selected ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {e.title ?? 'Untitled'}
                </div>
                {e.files[0]?.duration && (
                  <div className="font-mono text-[10px] text-fg-dim">
                    {Formatters.duration(e.files[0].duration)}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StatusDot(props: { status: EpisodeStatus }) {
  if (props.status === 'scanning') {
    return (
      <Loader2 className="size-3 text-warning animate-spin flex-shrink-0" />
    )
  }

  const color = {
    ready: 'bg-success shadow-[0_0_5px_var(--color-success)]',
    downloaded: 'bg-warning',
    missing: 'bg-white/10',
  }[props.status]

  return (
    <span
      data-slot="status-dot"
      className={cn('size-1.5 rounded-full flex-shrink-0', color)}
    />
  )
}

function computeStatus(
  episode: Episode,
  scanningPaths: Set<string>
): EpisodeStatus {
  if (episode.files.length === 0) {
    return 'missing'
  }

  if (episode.files.some((f) => scanningPaths.has(f.path))) {
    return 'scanning'
  }

  const fullyScanned = episode.files.every((f) => f.has_keyframes && f.has_vad)

  return fullyScanned ? 'ready' : 'downloaded'
}
