import { Check, Loader2 } from 'lucide-react'

import type { stream_type } from '@/db/connection'
import { Flag } from '@/web/components/flag'
import { cn } from '@/web/lib/cn'

import type { Track, TrackSelection } from '../-utils/use-track-selection'

type Tone = 'info' | 'warning' | 'primary'

const KIND_META: Record<stream_type, { tone: Tone; letter: string }> = {
  video: { tone: 'info', letter: 'V' },
  audio: { tone: 'warning', letter: 'A' },
  subtitle: { tone: 'primary', letter: 'S' },
}

const TONE_BG: Record<Tone, string> = {
  info: 'bg-info/[0.14] text-info',
  warning: 'bg-warning/[0.14] text-warning',
  primary: 'bg-primary/[0.13] text-primary',
}

export function DeliveredTrackRow(props: {
  track: Track
  selection: TrackSelection
  fileScanning: boolean
}) {
  const meta = KIND_META[props.track.stream_type]
  const selectedId = props.selection[props.track.stream_type]
  const selected = selectedId === props.track.id

  const scanState = computeScanState(props.track, props.fileScanning)

  const flagCode = props.track.language
    ? props.track.language.slice(0, 3).toLowerCase()
    : null

  return (
    <div
      data-component="delivered-track-row"
      data-track-id={props.track.id}
      data-stream-type={props.track.stream_type}
      data-selected={String(selected)}
      data-scan-state={scanState}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] border transition-colors',
        selected
          ? 'bg-primary/[0.08] border-primary/30'
          : 'bg-white/[0.025] border-border',
        scanState === 'queued' && 'opacity-60'
      )}
    >
      <span
        className={cn(
          'size-[22px] rounded-md flex items-center justify-center flex-shrink-0 font-mono text-[10px] font-bold',
          TONE_BG[meta.tone]
        )}
      >
        {meta.letter}
      </span>

      {flagCode && <Flag code={flagCode} size="sm" showLabel={false} />}

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-xs font-medium truncate">
          {primaryLabel(props.track)}
        </span>
        {props.track.codec_name && (
          <span className="font-mono text-[9px] font-semibold tracking-[0.04em] uppercase text-fg-dim bg-white/[0.05] px-1.5 py-px rounded">
            {props.track.codec_name}
          </span>
        )}
        {props.track.bit_rate != null && (
          <span className="font-mono text-[9px] text-fg-dim">
            {formatBitrate(props.track.bit_rate)}
          </span>
        )}
        {props.track.is_default && (
          <span className="font-mono text-[8px] tracking-[0.12em] uppercase text-fg-dim border border-border rounded-full px-1.5 py-px">
            default
          </span>
        )}
      </div>

      <ScanStatusPill
        state={scanState}
        selected={selected}
        onSelect={() =>
          props.selection.select(props.track.stream_type, props.track.id)
        }
        onClear={
          props.track.stream_type === 'subtitle' && selected
            ? () => props.selection.select('subtitle')
            : undefined
        }
      />
    </div>
  )
}

type ScanState = 'ready' | 'scanning' | 'queued'

function computeScanState(track: Track, fileScanning: boolean): ScanState {
  if (track.scan_ratio == null) {
    return 'ready'
  }

  if (track.scan_ratio >= 1) {
    return 'ready'
  }

  if (fileScanning) {
    return 'scanning'
  }

  return 'queued'
}

function ScanStatusPill(props: {
  state: ScanState
  selected: boolean
  onSelect: () => void
  onClear?: () => void
}) {
  if (props.state === 'scanning') {
    return (
      <span
        data-slot="track-scan-pill"
        data-state="scanning"
        className="inline-flex items-center gap-1.5 font-mono text-[8px] font-semibold tracking-[0.12em] uppercase text-warning bg-warning/[0.14] border border-warning/30 rounded-full px-2 py-1"
      >
        <Loader2 className="size-2.5 animate-spin" />
        scanning
      </span>
    )
  }

  if (props.state === 'queued') {
    return (
      <span
        data-slot="track-scan-pill"
        data-state="queued"
        className="font-mono text-[8px] font-semibold tracking-[0.12em] uppercase text-fg-dim bg-white/[0.04] border border-border rounded-full px-2 py-1"
      >
        queued
      </span>
    )
  }

  if (props.selected) {
    return (
      <button
        type="button"
        data-slot="track-scan-pill"
        data-state="using"
        onClick={props.onClear}
        disabled={!props.onClear}
        className={cn(
          'inline-flex items-center gap-1.5 font-mono text-[8px] font-bold tracking-[0.12em] uppercase text-primary bg-primary/[0.13] border border-primary/30 rounded-full px-2 py-1',
          props.onClear
            ? 'cursor-pointer hover:bg-primary/20'
            : 'cursor-default'
        )}
      >
        <Check className="size-2.5" />
        using
      </button>
    )
  }

  return (
    <button
      type="button"
      data-slot="track-scan-pill"
      data-state="available"
      onClick={props.onSelect}
      className="text-[10px] font-medium text-muted-foreground bg-transparent border border-border rounded-full px-2.5 py-1 cursor-pointer hover:bg-white/[0.06] hover:text-foreground transition-colors"
    >
      Use this
    </button>
  )
}

function primaryLabel(track: Track) {
  if (track.stream_type === 'video') {
    if (track.width && track.height) {
      return `${track.width}×${track.height}`
    }
    return track.codec_name
  }

  const lang = track.language ? displayLang(track.language) : null
  const channels = track.channel_layout

  if (track.stream_type === 'audio') {
    if (lang && channels) {
      return `${lang} ${channels}`
    }
    return lang ?? channels ?? track.codec_name
  }

  return lang ?? track.title ?? 'Subtitle'
}

function formatBitrate(bps: number) {
  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`
  }
  return `${Math.round(bps / 1000)} kbps`
}

const LANG_MAP: Record<string, string> = {
  en: 'English',
  eng: 'English',
  pt: 'Português',
  por: 'Português',
  es: 'Español',
  spa: 'Español',
  fr: 'Français',
  fre: 'Français',
  fra: 'Français',
  de: 'Deutsch',
  ger: 'Deutsch',
  deu: 'Deutsch',
  it: 'Italiano',
  ita: 'Italiano',
  nl: 'Nederlands',
  dut: 'Nederlands',
  ja: '日本語',
  jpn: '日本語',
  ko: '한국어',
  kor: '한국어',
  zh: '中文',
  chi: '中文',
  ru: 'Русский',
  rus: 'Русский',
}

function displayLang(code: string) {
  return LANG_MAP[code.toLowerCase()] ?? code.toUpperCase()
}
