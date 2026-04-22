import {
  Check,
  ChevronDown,
  Download as DownloadIcon,
  Loader2,
} from 'lucide-react'
import { useState } from 'react'

import { Formatters } from '@/lib/formatters'
import { cn } from '@/web/lib/cn'
import type { MediaInfo } from '@/web/types/library'

import type { TrackSelection } from '../-utils/use-track-selection'
import { DeliveredTrackRow } from './delivered-track-row'

type Download = MediaInfo['downloads'][number]
type DownloadFile = Download['files'][number]

type ReleaseState = 'ready' | 'scanning' | 'downloading' | 'error' | 'queued'

export function LibraryOverview(props: {
  media: MediaInfo
  scanningPaths: Set<string>
  selection: TrackSelection
}) {
  const [expandedId, setExpandedId] = useState<number | undefined>(
    props.media.downloads[0]?.id
  )

  const releases = props.media.downloads.map((d) =>
    toReleaseSummary(d, props.scanningPaths)
  )

  const totalFiles = releases.reduce((a, r) => a + r.fileCount, 0)
  const downloadedSize = releases.reduce(
    (a, r) => a + (r.downloadProgress >= 1 ? r.sizeBytes : 0),
    0
  )
  const totalSize = releases.reduce((a, r) => a + r.sizeBytes, 0)
  const scannedFiles = releases.reduce((a, r) => a + r.scannedFileCount, 0)
  const totalEps = props.media.seasons.reduce(
    (a, s) => a + s.episodes.length,
    0
  )
  const playableEps = props.media.seasons.reduce(
    (a, s) =>
      a +
      s.episodes.filter(
        (e) =>
          e.files.length > 0 &&
          e.files.every((f) => f.has_keyframes && f.has_vad)
      ).length,
    0
  )
  const activeDownloads = releases.filter(
    (r) => r.state === 'downloading'
  ).length
  const activeScans = releases.filter((r) => r.state === 'scanning').length

  if (releases.length === 0) {
    return null
  }

  return (
    <div data-component="library-overview" data-media-id={props.media.id}>
      <div className="flex items-baseline gap-3 mb-3.5">
        <h2 className="text-[18px] font-semibold tracking-tight">
          Library overview
        </h2>
        <span className="font-mono text-[11px] text-fg-dim">
          {releases.length} releases ·{' '}
          {!!props.media.seasons.length &&
            `${props.media.seasons.length} seasons · ${totalEps} eps`}
          {!props.media.seasons.length && `${totalFiles} files`}
        </span>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="grid grid-cols-4 gap-6 px-[18px] py-3.5 border-b border-border bg-black/25">
          <AggStat
            label="STATE"
            value={
              <StateValue
                activeDownloads={activeDownloads}
                activeScans={activeScans}
              />
            }
          />
          <AggStat
            label="DOWNLOADED"
            value={
              <span className="font-mono">
                {Formatters.size(downloadedSize)} /{' '}
                {!!totalSize && Formatters.size(totalSize)}
                {!totalSize && '?'}
              </span>
            }
            progress={totalSize ? downloadedSize / totalSize : 0}
            color="primary"
          />
          <AggStat
            label="SCANNED"
            value={
              <span className="font-mono">
                {scannedFiles}/{totalFiles} files
              </span>
            }
            progress={totalFiles ? scannedFiles / totalFiles : 0}
            color="warning"
          />
          <AggStat
            label="PLAYABLE EPS"
            value={
              <span className="font-mono text-success">
                {!!totalEps && `${playableEps} of ${totalEps}`}
                {!totalEps && '—'}
              </span>
            }
          />
        </div>

        <div className="grid grid-cols-[100px_1fr_220px_90px_36px] gap-3 px-[18px] py-2 border-b border-border font-mono text-[9px] tracking-[0.12em] uppercase text-fg-dim">
          <span>STATE</span>
          <span>RELEASE</span>
          <span>DOWNLOAD → SCAN</span>
          <span className="text-right">SIZE</span>
          <span />
        </div>

        {releases.map((r, i) => (
          <ReleaseRow
            key={r.id}
            release={r}
            expanded={expandedId === r.id}
            onToggle={() =>
              setExpandedId(expandedId === r.id ? undefined : r.id)
            }
            isLast={i === releases.length - 1}
            selection={props.selection}
          />
        ))}
      </div>
    </div>
  )
}

function StateValue(props: { activeDownloads: number; activeScans: number }) {
  const busy = props.activeDownloads + props.activeScans > 0

  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
      {busy && (
        <>
          <Loader2 className="size-2.5 text-warning animate-spin" />
          <span>Ingesting</span>
          <span className="font-mono text-[10px] text-fg-dim font-normal">
            · {props.activeDownloads} dl · {props.activeScans} scan
          </span>
        </>
      )}
      {!busy && (
        <>
          <Check className="size-2.5 text-success" />
          <span>Ready</span>
        </>
      )}
    </span>
  )
}

function AggStat(props: {
  label: string
  value: React.ReactNode
  progress?: number
  color?: 'primary' | 'warning'
}) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-dim mb-1.5">
        {props.label}
      </div>
      <div className="text-sm font-medium">{props.value}</div>
      {props.progress != null && (
        <div className="h-[3px] bg-white/[0.07] rounded-full overflow-hidden mt-2">
          <div
            className={cn(
              'h-full transition-[width] duration-1000 ease-linear',
              props.color === 'warning'
                ? 'bg-warning shadow-[0_0_6px_var(--color-warning)]'
                : 'bg-primary shadow-[0_0_6px_var(--color-primary)]'
            )}
            style={{ width: `${Math.min(100, props.progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function ReleaseRow(props: {
  release: ReleaseSummary
  expanded: boolean
  onToggle: () => void
  isLast: boolean
  selection: TrackSelection
}) {
  const r = props.release
  const showBorder = !props.isLast || props.expanded

  return (
    <>
      <button
        type="button"
        data-component="library-release-row"
        data-release-id={r.id}
        data-state={r.state}
        data-expanded={String(props.expanded)}
        data-download-progress={r.downloadProgress}
        data-scan-progress={r.scanProgress}
        data-scan-step={r.scanDetail?.step}
        data-speed={r.speed}
        data-error-at={r.errorAt}
        onClick={props.onToggle}
        className={cn(
          'grid grid-cols-[100px_1fr_220px_90px_36px] gap-3 items-center w-full px-[18px] py-3.5 text-left cursor-pointer transition-colors',
          props.expanded ? 'bg-white/[0.02]' : 'hover:bg-white/[0.015]',
          showBorder && 'border-b border-border'
        )}
      >
        <StatePill state={r.state} />

        <div className="min-w-0">
          <div className="font-mono text-xs truncate">{r.name}</div>
          <div className="font-mono text-[9px] text-fg-dim mt-1 flex gap-2">
            {r.indexer && <span className="text-primary">{r.indexer}</span>}
            {r.indexer && <span>·</span>}
            <span>{r.role}</span>
            <span>·</span>
            <span>{r.fileCount} files</span>
          </div>
        </div>

        <InlinePipeline release={r} />

        <span className="font-mono text-[10px] text-fg-dim text-right">
          {!!r.sizeBytes && Formatters.size(r.sizeBytes)}
          {!r.sizeBytes && '—'}
        </span>

        <ChevronDown
          className={cn(
            'size-3 text-fg-dim justify-self-end transition-transform duration-200',
            props.expanded && 'rotate-180'
          )}
        />
      </button>

      {props.expanded && (
        <div
          data-component="library-release-row-expanded"
          data-release-id={r.id}
          className={cn(
            'px-[18px] py-4 bg-black/35',
            !props.isLast && 'border-b border-border'
          )}
        >
          {r.state === 'scanning' && r.scanDetail && (
            <div className="font-mono text-[10px] text-fg-dim mb-2.5 flex items-center gap-2">
              <Loader2 className="size-2.5 text-warning animate-spin" />
              <span className="text-warning">
                {r.scanDetail.current}/{r.scanDetail.total} files
              </span>
              {r.scanDetail.step && <span>· {r.scanDetail.step}</span>}
            </div>
          )}

          {r.state === 'downloading' && r.downloadDetail && (
            <div className="font-mono text-[10px] text-fg-dim mb-2.5 flex items-center gap-2">
              <DownloadIcon className="size-2.5 text-primary" />
              {r.downloadDetail.speed && (
                <span className="text-primary">{r.downloadDetail.speed}</span>
              )}
              {r.downloadDetail.eta && (
                <span>· ETA {r.downloadDetail.eta}</span>
              )}
            </div>
          )}

          {r.error && (
            <div className="font-mono text-[10px] text-destructive mb-2.5">
              {r.error}
            </div>
          )}

          {r.tracks.length > 0 && (
            <>
              <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-dim mb-2">
                Delivered tracks · {r.tracks.length}
              </div>
              <div className="flex flex-col gap-1.5">
                {r.tracks.map((t) => (
                  <DeliveredTrackRow
                    key={t.id}
                    track={t}
                    selection={props.selection}
                    fileScanning={r.scanningFileIds.has(t.media_file_id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

const STATE_META: Record<
  ReleaseState,
  {
    label: string
    tone: 'success' | 'warning' | 'primary' | 'destructive' | 'muted'
  }
> = {
  ready: { label: 'READY', tone: 'success' },
  scanning: { label: 'SCANNING', tone: 'warning' },
  downloading: { label: 'DOWNLOAD', tone: 'primary' },
  error: { label: 'ERROR', tone: 'destructive' },
  queued: { label: 'QUEUED', tone: 'muted' },
}

const TONE_CLASSES: Record<
  'success' | 'warning' | 'primary' | 'destructive' | 'muted',
  string
> = {
  success: 'text-success bg-success/[0.14] border-success/30',
  warning: 'text-warning bg-warning/[0.14] border-warning/30',
  primary: 'text-primary bg-primary/[0.14] border-primary/30',
  destructive: 'text-destructive bg-destructive/[0.14] border-destructive/30',
  muted: 'text-fg-dim bg-white/[0.04] border-border',
}

function StatePill(props: { state: ReleaseState }) {
  const meta = STATE_META[props.state]

  return (
    <span
      data-slot="release-state-pill"
      data-state={props.state}
      className={cn(
        'inline-flex items-center gap-1 justify-self-start rounded-full border px-2.5 py-1 font-mono text-[8px] font-bold tracking-[0.12em] uppercase',
        TONE_CLASSES[meta.tone]
      )}
    >
      {props.state === 'scanning' && (
        <Loader2 className="size-2.5 animate-spin" />
      )}
      {props.state === 'downloading' && <DownloadIcon className="size-2.5" />}
      {props.state === 'ready' && <Check className="size-2.5" />}
      {meta.label}
    </span>
  )
}

function InlinePipeline(props: { release: ReleaseSummary }) {
  const r = props.release
  const downloadDone = r.downloadProgress >= 1
  const scanDone = r.scanProgress >= 1

  return (
    <div className="flex items-center gap-1.5">
      <InlinePhase
        label="DL"
        value={r.downloadProgress}
        active={r.state === 'downloading'}
        done={downloadDone}
      />
      <ChevronDown
        className={cn(
          '-rotate-90 size-2.5 flex-shrink-0',
          downloadDone ? 'text-primary' : 'text-fg-dim opacity-40'
        )}
      />
      <InlinePhase
        label="SCAN"
        value={r.scanProgress}
        active={r.state === 'scanning'}
        done={scanDone}
        tone={scanDone ? 'primary' : 'warning'}
      />
    </div>
  )
}

function InlinePhase(props: {
  label: string
  value: number
  active: boolean
  done: boolean
  tone?: 'primary' | 'warning'
}) {
  const tone = props.tone ?? 'primary'
  const barColor =
    tone === 'warning'
      ? 'bg-warning shadow-[0_0_6px_var(--color-warning)]'
      : 'bg-primary shadow-[0_0_6px_var(--color-primary)]'

  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between mb-0.5">
        <span
          className={cn(
            'font-mono text-[8px] font-bold tracking-[0.12em]',
            props.active
              ? tone === 'warning'
                ? 'text-warning'
                : 'text-primary'
              : props.done
                ? 'text-foreground'
                : 'text-fg-dim'
          )}
        >
          {props.label}
        </span>
        <span className="font-mono text-[8px] font-semibold text-fg-dim">
          {Math.round(props.value * 100)}%
        </span>
      </div>
      <div className="h-[3px] bg-white/[0.07] rounded-full overflow-hidden relative">
        <div
          className={cn(
            'h-full transition-[width] duration-1000 ease-linear relative',
            barColor,
            !props.active && 'shadow-none'
          )}
          style={{ width: `${props.value * 100}%` }}
        >
          {props.active && (
            <div className="absolute inset-0 animate-shimmer-sweep bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]" />
          )}
        </div>
      </div>
    </div>
  )
}

export type ReleaseSummary = {
  id: number
  name: string
  state: ReleaseState
  indexer: string | null
  role: string
  fileCount: number
  scannedFileCount: number
  sizeBytes: number
  downloadProgress: number
  scanProgress: number
  speed: number
  errorAt: string | null
  tracks: (DownloadFile['tracks'][number] & { media_file_id: number })[]
  scanningFileIds: Set<number>
  scanDetail: { current: number; total: number; step?: string } | null
  downloadDetail: { speed?: string; eta?: string } | null
  error: string | null
}

function toReleaseSummary(
  download: Download,
  scanningPaths: Set<string>
): ReleaseSummary {
  const name = download.content_path?.split('/').at(-1) ?? download.source_id

  const sizeBytes = download.files.reduce((a, f) => a + f.size, 0)
  const scannedFileCount = download.files.filter(
    (f) => f.has_keyframes && f.has_vad
  ).length
  const fileCount = download.files.length

  const scanningFiles = download.files.filter((f) => scanningPaths.has(f.path))
  const scanningFileIds = new Set(scanningFiles.map((f) => f.id))

  const tracks = download.files.flatMap((f) =>
    f.tracks.map((t) => ({ ...t, media_file_id: f.id }))
  )

  const scanProgress = fileCount > 0 ? scannedFileCount / fileCount : 0
  const downloadProgress = download.progress

  const state = inferState({
    downloadStatus: download.status,
    downloadProgress,
    scanProgress,
    isScanning: scanningFiles.length > 0,
  })

  const scanDetail =
    state === 'scanning'
      ? {
          current: scannedFileCount,
          total: fileCount,
          step: scanningFiles[0]
            ? scanningFiles[0].path.split('/').at(-1)
            : undefined,
        }
      : null

  const downloadDetail =
    state === 'downloading'
      ? {
          speed:
            download.speed > 0 ? Formatters.speed(download.speed) : undefined,
          eta: download.eta ? Formatters.duration(download.eta) : undefined,
        }
      : null

  const role = describeRole(download)

  return {
    id: download.id,
    name,
    state,
    indexer: download.source,
    role,
    fileCount,
    scannedFileCount,
    sizeBytes,
    downloadProgress,
    scanProgress,
    speed: download.speed,
    errorAt: download.error_at,
    tracks,
    scanningFileIds,
    scanDetail,
    downloadDetail,
    error: download.status === 'error' ? 'Download failed' : null,
  }
}

function inferState(args: {
  downloadStatus: Download['status']
  downloadProgress: number
  scanProgress: number
  isScanning: boolean
}): ReleaseState {
  if (args.downloadStatus === 'error') {
    return 'error'
  }

  if (args.downloadStatus === 'downloading' || args.downloadProgress < 1) {
    return 'downloading'
  }

  if (args.isScanning) {
    return 'scanning'
  }

  if (args.scanProgress >= 1) {
    return 'ready'
  }

  return 'queued'
}

function describeRole(download: Download) {
  const parts: string[] = []

  if (download.season_number != null) {
    parts.push(`S${String(download.season_number).padStart(2, '0')}`)
  }

  if (download.episode_number != null) {
    parts.push(`E${String(download.episode_number).padStart(2, '0')}`)
  }

  return parts.length ? parts.join(' · ') : 'full release'
}
