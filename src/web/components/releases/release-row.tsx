import { Formatters } from '@/lib/formatters'
import { Tooltip } from '@/web/components/ui/tooltip'
import { cn } from '@/web/lib/cn'
import type { Release } from '@/web/types/releases'

const BADGE_STYLES = {
  resolution: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  codec: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  hdr: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  source: 'bg-primary/15 text-primary border-primary/30',
  seeders: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  neutral: 'bg-white/5 text-muted-foreground border-white/10',
} as const

export function ReleaseRow(props: {
  release: Release
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={props.onSelect}
      data-component="release-row"
      data-source-id={props.release.source_id}
      className={cn(
        'w-full text-left rounded-lg glass-liquid px-4 py-3 transition-all duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer',
        props.selected
          ? 'ring-1 ring-primary/40 !bg-primary/10'
          : 'hover:!bg-white/10'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Tooltip content={props.release.name}>
            <p className="text-sm font-medium truncate">{props.release.name}</p>
          </Tooltip>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Badge variant="source">{props.release.indexer_source}</Badge>
            {props.release.resolution && (
              <Badge variant="resolution">{props.release.resolution}</Badge>
            )}
            {props.release.codec && (
              <Badge variant="codec">{props.release.codec}</Badge>
            )}
            {props.release.hdr.length > 0 && (
              <Badge variant="hdr">{props.release.hdr.join('/')}</Badge>
            )}
            <Badge variant="neutral">
              {Formatters.size(props.release.size)}
            </Badge>
            {props.release.seeders > 0 && (
              <Badge variant="seeders">{props.release.seeders} seeds</Badge>
            )}
          </div>
        </div>

        <div
          className={cn(
            'flex-shrink-0 size-4 rounded-full border-2 transition-all duration-[var(--duration-fast)]',
            props.selected
              ? 'border-primary bg-primary shadow-[0_0_8px_rgba(99,102,241,0.5)]'
              : 'border-white/20'
          )}
        />
      </div>
    </button>
  )
}

function Badge(props: {
  variant: keyof typeof BADGE_STYLES
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border',
        BADGE_STYLES[props.variant]
      )}
    >
      {props.children}
    </span>
  )
}
