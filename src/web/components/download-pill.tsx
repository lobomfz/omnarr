import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { useState } from 'react'

import { Formatters } from '@/lib/formatters'
import { orpc } from '@/web/client'
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '@/web/components/ui/popover'
import { Tooltip } from '@/web/components/ui/tooltip'
import { useDownloadProgressSubscription } from '@/web/lib/subscriptions'

function useInProgressDownloads() {
  return useQuery(orpc.downloads.listInProgress.queryOptions({}))
}

function PillButton(props: {
  nav: 'desktop' | 'mobile'
  count: number
  pct: number
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      data-component="download-pill"
      data-nav={props.nav}
      data-count={String(props.count)}
      className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-full transition-all duration-[var(--duration-fast)] text-muted-foreground hover:text-white hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Download className="size-3.5 text-primary" />
      <span className="font-medium">{props.count}</span>
      <div className="h-1.5 w-10 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear"
          style={{ width: `${props.pct}%` }}
        />
      </div>
    </button>
  )
}

export function DownloadPill(props: { nav: 'desktop' | 'mobile' }) {
  useDownloadProgressSubscription()

  const { data } = useInProgressDownloads()
  const [open, setOpen] = useState(false)

  if (!data || data.length === 0) {
    return null
  }

  const totalProgress =
    data.reduce((sum, d) => sum + d.progress, 0) / data.length
  const pct = Math.round(totalProgress * 100)

  if (!open) {
    return (
      <PillButton
        nav={props.nav}
        count={data.length}
        pct={pct}
        onClick={() => setOpen(true)}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PillButton nav={props.nav} count={data.length} pct={pct} />
      </PopoverTrigger>

      <PopoverContent className="w-80" sideOffset={12}>
        <div className="max-h-64 overflow-y-auto">
          {data.map((d) => (
            <PillEntry key={d.id} download={d} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PillEntry(props: {
  download: {
    id: number
    media_id: string
    title: string
    year: number | null
    progress: number
    speed: number
    status: string
  }
}) {
  const pct = Math.round(props.download.progress * 100)

  return (
    <PopoverClose asChild>
      <Link
        to="/media/$id"
        params={{ id: props.download.media_id }}
        data-component="pill-entry"
        data-media-id={props.download.media_id}
        className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors duration-[var(--duration-fast)]"
      >
        <div className="flex-1 min-w-0">
          <Tooltip content={props.download.title}>
            <p className="text-sm font-medium text-foreground truncate">
              {props.download.title}
            </p>
          </Tooltip>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground font-medium flex-shrink-0">
              {pct}%
            </span>
          </div>
          {props.download.speed > 0 && (
            <span className="text-[11px] text-muted-foreground mt-0.5 block">
              {Formatters.speed(props.download.speed)}
            </span>
          )}
        </div>
      </Link>
    </PopoverClose>
  )
}
