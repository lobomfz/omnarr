import { Check, Loader2, MoreHorizontal } from 'lucide-react'

import { Formatters } from '@/lib/formatters'
import { Tooltip } from '@/web/components/ui/tooltip'
import type { MediaInfo } from '@/web/types/library'

import type { TrackSelection } from '../-utils/use-track-selection'
import { DeliveredTrackRow } from './delivered-track-row'

type Download = MediaInfo['downloads'][number]
type Episode = MediaInfo['seasons'][number]['episodes'][number]
type EpisodeFile = Episode['files'][number]

export function EpisodeDetail(props: {
  seasonNumber: number
  episode: Episode
  downloads: Download[]
  scanningPaths: Set<string>
  selection: TrackSelection
}) {
  return (
    <div
      data-component="episode-detail"
      data-episode-number={props.episode.episode_number}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-primary/90 mb-1">
            S{String(props.seasonNumber).padStart(2, '0')} · E
            {String(props.episode.episode_number).padStart(2, '0')}
          </div>
          <div className="text-xl font-semibold tracking-tight">
            {props.episode.title ?? 'Untitled'}
          </div>
        </div>
        <span className="flex-1" />
        {props.episode.files[0]?.duration && (
          <span className="font-mono text-[11px] text-fg-dim">
            {Formatters.duration(props.episode.files[0].duration)}
          </span>
        )}
      </div>

      {props.episode.files.length === 0 && <EmptyState />}
      {props.episode.files.length > 0 && (
        <>
          <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-dim flex items-center gap-2.5">
            <span>
              Sources for E
              {String(props.episode.episode_number).padStart(2, '0')} ·{' '}
              {props.episode.files.length}
            </span>
            <span className="size-1 rounded-full bg-border" />
            <span className="tracking-normal normal-case text-muted-foreground">
              tracks from these releases are mixed into this episode
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {props.episode.files.map((file) => (
              <SourceCard
                key={file.id}
                file={file}
                download={props.downloads.find(
                  (d) => d.id === file.download_id
                )}
                scanning={props.scanningPaths.has(file.path)}
                selection={props.selection}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div
      data-component="episode-detail-empty"
      className="bg-card border border-border rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground"
    >
      No downloads for this episode yet.
    </div>
  )
}

function SourceCard(props: {
  file: EpisodeFile
  download: Download | undefined
  scanning: boolean
  selection: TrackSelection
}) {
  const fileName = props.file.path.split('/').at(-1) ?? props.file.path
  const role = roleLabel(props.file)

  const state = props.scanning
    ? 'scanning'
    : props.file.has_keyframes && props.file.has_vad
      ? 'ready'
      : 'pending'

  return (
    <div
      data-component="source-card"
      data-file-id={props.file.id}
      data-download-id={props.download?.id}
      data-state={state}
      className="bg-card border border-border rounded-2xl"
    >
      <div className="px-4 py-3 flex items-center gap-3 border-b border-border">
        <StateBadge state={state} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-[8px] font-semibold tracking-[0.12em] uppercase text-fg-dim">
              {role}
            </span>
            {props.download?.source && (
              <span className="font-mono text-[9px] text-primary/90">
                · {props.download.source}
              </span>
            )}
            <span className="font-mono text-[9px] text-fg-dim">
              · {Formatters.size(props.file.size)}
            </span>
          </div>
          <Tooltip content={fileName}>
            <div className="font-mono text-[11px] text-muted-foreground truncate">
              {fileName}
            </div>
          </Tooltip>
        </div>
        <button
          type="button"
          aria-label="More"
          className="text-fg-dim hover:text-foreground transition-colors p-1 cursor-pointer"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
      <div
        data-component="source-card-tracks"
        data-total={props.file.tracks.length}
        className="p-2.5 flex flex-col gap-1.5 max-h-[320px] overflow-y-auto scrollbar-none"
      >
        {props.file.tracks.map((t) => (
          <DeliveredTrackRow
            key={t.id}
            track={t}
            selection={props.selection}
            fileScanning={props.scanning}
          />
        ))}
      </div>
    </div>
  )
}

function StateBadge(props: { state: 'ready' | 'scanning' | 'pending' }) {
  if (props.state === 'scanning') {
    return (
      <span className="size-7 rounded-lg bg-warning/[0.14] text-warning flex items-center justify-center flex-shrink-0">
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    )
  }

  if (props.state === 'ready') {
    return (
      <span className="size-7 rounded-lg bg-success/[0.14] text-success flex items-center justify-center flex-shrink-0">
        <Check className="size-3.5" />
      </span>
    )
  }

  return (
    <span className="size-7 rounded-lg bg-white/[0.04] text-fg-dim flex items-center justify-center flex-shrink-0">
      <Check className="size-3.5 opacity-50" />
    </span>
  )
}

function roleLabel(file: EpisodeFile) {
  const types = new Set(file.tracks.map((t) => t.stream_type))
  const hasVideo = types.has('video')
  const hasAudio = types.has('audio')
  const hasSubs = types.has('subtitle')

  if (hasVideo && hasAudio) {
    return hasSubs ? 'video + audio + subs' : 'video + audio'
  }

  if (hasAudio && !hasVideo) {
    return 'external audio'
  }

  if (hasSubs && !hasVideo && !hasAudio) {
    return 'external subtitle'
  }

  if (hasVideo) {
    return 'video'
  }

  return 'unknown'
}
