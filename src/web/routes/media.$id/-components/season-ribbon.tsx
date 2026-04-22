import { cn } from '@/web/lib/cn'
import type { MediaInfo } from '@/web/types/library'

type Season = MediaInfo['seasons'][number]

export function SeasonRibbon(props: {
  seasons: Season[]
  downloadingSeasons: Set<number>
  selectedSeason: number | undefined
  onSelect: (seasonNumber: number) => void
}) {
  if (props.seasons.length <= 1) {
    return null
  }

  return (
    <div
      data-component="season-ribbon"
      className="flex gap-1.5 items-center flex-wrap"
    >
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-dim mr-1">
        Seasons
      </span>
      {props.seasons.map((s) => {
        const active = s.season_number === props.selectedSeason
        const downloading = props.downloadingSeasons.has(s.season_number)

        return (
          <button
            key={s.season_number}
            type="button"
            data-slot="season-pill"
            data-season-number={s.season_number}
            data-selected={String(active)}
            data-downloading={String(downloading)}
            onClick={() => props.onSelect(s.season_number)}
            className={cn(
              'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold cursor-pointer transition-colors',
              active
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-white/[0.04] border-border text-muted-foreground hover:bg-white/[0.08]'
            )}
          >
            <span
              className={cn(
                'font-mono text-[10px] tracking-[0.04em]',
                active ? 'text-primary' : 'text-foreground'
              )}
            >
              S{String(s.season_number).padStart(2, '0')}
            </span>
            <span
              className={cn(
                'text-[10px] font-normal',
                active ? 'text-primary' : 'text-fg-dim'
              )}
            >
              {s.episodes.length}
            </span>
            {downloading && (
              <span className="size-[5px] rounded-full bg-primary shadow-[0_0_5px_var(--color-primary)]" />
            )}
          </button>
        )
      })}
    </div>
  )
}
