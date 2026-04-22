import { Check, Download, Loader2 } from 'lucide-react'

import { Formatters } from '@/lib/formatters'
import { Tooltip } from '@/web/components/ui/tooltip'
import { cn } from '@/web/lib/cn'
import type { Release } from '@/web/types/releases'

export function ActionBar(props: {
  release?: Release
  isRipper: boolean
  audioOnly: boolean
  onAudioOnlyChange: (v: boolean) => void
  isPending: boolean
  isSuccess: boolean
  onDownload: () => void
}) {
  return (
    <div
      data-component="action-bar"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 glass-liquid"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-4 flex items-center gap-4">
        {!!props.release && (
          <SelectedState
            release={props.release}
            isRipper={props.isRipper}
            audioOnly={props.audioOnly}
            onAudioOnlyChange={props.onAudioOnlyChange}
            isPending={props.isPending}
            isSuccess={props.isSuccess}
            onDownload={props.onDownload}
          />
        )}
        {!props.release && <EmptyState />}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <>
      <p className="flex-1 text-sm text-muted-foreground">
        Select a release to download.
      </p>
      <button
        disabled
        data-slot="download"
        className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium bg-primary/30 text-white/50 cursor-not-allowed flex-shrink-0"
      >
        <Download className="size-4" />
        Download
      </button>
    </>
  )
}

function SelectedState(props: {
  release: Release
  isRipper: boolean
  audioOnly: boolean
  onAudioOnlyChange: (v: boolean) => void
  isPending: boolean
  isSuccess: boolean
  onDownload: () => void
}) {
  return (
    <>
      <div className="flex-1 min-w-0">
        <Tooltip content={props.release.name}>
          <p className="text-sm font-medium truncate">{props.release.name}</p>
        </Tooltip>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {Formatters.size(props.release.size)}
          </span>
          {props.release.seeders > 0 && (
            <span className="text-xs text-emerald-400">
              {props.release.seeders} seeds
            </span>
          )}
        </div>
      </div>

      {props.isRipper && (
        <label className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Audio only</span>
          <button
            onClick={() => props.onAudioOnlyChange(!props.audioOnly)}
            className={cn(
              'relative w-9 h-5 rounded-full transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              props.audioOnly ? 'bg-primary' : 'bg-white/15 hover:bg-white/20'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform duration-[var(--duration-fast)]',
                props.audioOnly && 'translate-x-4'
              )}
            />
          </button>
        </label>
      )}

      <button
        onClick={props.onDownload}
        disabled={props.isPending || props.isSuccess}
        data-slot="download"
        className={cn(
          'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-[var(--duration-fast)] flex-shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer',
          props.isSuccess
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {props.isPending && <Loader2 className="size-4 animate-spin" />}
        {props.isSuccess && <Check className="size-4" />}
        {!props.isPending && !props.isSuccess && (
          <Download className="size-4" />
        )}
        {props.isSuccess && 'Started'}
        {!props.isSuccess && 'Download'}
      </button>
    </>
  )
}
