import { Loader2 } from 'lucide-react'

import { Tooltip } from '@/web/components/ui/tooltip'

export function ScanProgress(props: {
  progress: { current: number; total: number; path: string }
}) {
  return (
    <div className="rounded-xl glass-liquid p-4 mb-4">
      <div className="flex items-center gap-3">
        <Loader2 className="size-4 text-primary animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium">Scanning...</span>
            <span className="text-xs text-muted-foreground">
              {props.progress.current}/{props.progress.total}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-linear"
              style={{
                width: `${Math.round((props.progress.current / props.progress.total) * 100)}%`,
              }}
            />
          </div>
          <Tooltip content={props.progress.path}>
            <p className="text-[11px] text-muted-foreground truncate">
              {props.progress.path.split('/').at(-1)}
            </p>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
