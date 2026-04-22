import { ChevronDown } from 'lucide-react'

import type { stream_type } from '@/db/connection'
import { Flag } from '@/web/components/flag'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/web/components/ui/popover'
import { cn } from '@/web/lib/cn'

import type { Track, TrackSelection } from '../-utils/use-track-selection'

const KIND_LABEL: Record<stream_type, string> = {
  video: 'Video',
  audio: 'Audio',
  subtitle: 'Subs',
}

export function HeroTrackChips(props: {
  tracks: Track[]
  selection: TrackSelection
}) {
  const groups = groupTracks(props.tracks)
  const videoTracks = groups.get('video') ?? []

  return (
    <div
      data-component="hero-track-chips"
      className="inline-flex items-center gap-1.5"
    >
      {videoTracks.length > 1 && (
        <HeroTrackChip
          kind="video"
          tracks={videoTracks}
          selectedId={props.selection.video}
          onSelect={(id) => props.selection.select('video', id)}
        />
      )}
      <HeroTrackChip
        kind="audio"
        tracks={groups.get('audio') ?? []}
        selectedId={props.selection.audio}
        onSelect={(id) => props.selection.select('audio', id)}
      />
      <HeroTrackChip
        kind="subtitle"
        tracks={groups.get('subtitle') ?? []}
        selectedId={props.selection.subtitle}
        onSelect={(id) => props.selection.select('subtitle', id)}
        clearable
      />
    </div>
  )
}

function HeroTrackChip(props: {
  kind: stream_type
  tracks: Track[]
  selectedId: number | undefined
  onSelect: (id?: number) => void
  clearable?: boolean
}) {
  const selected = props.tracks.find((t) => t.id === props.selectedId)
  const count = props.tracks.length
  const disabled = count === 0 || (count <= 1 && !props.clearable)
  const flag = selected?.language ? normalizeLang(selected.language) : null
  const kindLabel = KIND_LABEL[props.kind]

  const body = (
    <>
      <span className="font-mono text-[9px] font-semibold tracking-[0.08em] uppercase text-fg-dim">
        {kindLabel}
      </span>
      {flag && <Flag code={flag} size="sm" showLabel={false} />}
      <span className="text-xs font-medium tracking-[-0.005em] truncate">
        {primaryLabel(props.kind, selected)}
      </span>
      {count > 1 && (
        <span className="font-mono text-[9px] tracking-[0.04em] text-fg-dim">
          +{count - 1}
        </span>
      )}
      {!disabled && (
        <ChevronDown className="size-2.5 text-muted-foreground flex-shrink-0 ml-px" />
      )}
    </>
  )

  const baseClass = cn(
    'inline-flex items-center gap-[7px] h-[30px] px-2.5 rounded-full',
    'backdrop-blur-[10px] bg-[rgba(10,7,6,0.55)]',
    'border transition-[background,border-color] duration-150 ease-[var(--ease-apple)]',
    disabled
      ? 'border-white/[0.08] text-fg-dim cursor-default'
      : 'border-white/[0.16] text-foreground cursor-pointer hover:bg-white/[0.10] hover:border-white/[0.28]'
  )

  if (disabled) {
    return (
      <div
        data-component="hero-track-chip"
        data-stream-type={props.kind}
        data-count={count}
        data-selected-track-id={selected?.id}
        data-disabled="true"
        className={baseClass}
      >
        {body}
      </div>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-component="hero-track-chip"
          data-stream-type={props.kind}
          data-count={count}
          data-selected-track-id={selected?.id}
          data-disabled="false"
          className={baseClass}
        >
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[280px] max-h-[340px] overflow-y-auto scrollbar-none p-1"
      >
        {props.clearable && (
          <TrackOption
            trackId="off"
            label="Off"
            secondary="no subtitles"
            selected={props.selectedId == null}
            onSelect={() => props.onSelect()}
          />
        )}
        {props.tracks.map((t) => (
          <TrackOption
            key={t.id}
            trackId={t.id}
            label={trackPrimary(t)}
            secondary={trackSecondary(t)}
            flag={t.language ? normalizeLang(t.language) : null}
            selected={t.id === props.selectedId}
            onSelect={() => props.onSelect(t.id)}
          />
        ))}
      </PopoverContent>
    </Popover>
  )
}

function TrackOption(props: {
  trackId?: number | string
  label: string
  secondary: string
  flag?: string | null
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      data-component="track-option"
      data-track-id={props.trackId}
      data-selected={String(props.selected)}
      onClick={props.onSelect}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer transition-colors',
        props.selected
          ? 'bg-primary/15 text-primary'
          : 'hover:bg-white/5 text-foreground'
      )}
    >
      {!!props.flag && <Flag code={props.flag} size="sm" showLabel={false} />}
      {!props.flag && <span className="size-3.5" />}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate">{props.label}</div>
        <div className="font-mono text-[10px] text-muted-foreground truncate">
          {props.secondary}
        </div>
      </div>
    </button>
  )
}

function groupTracks(tracks: Track[]) {
  const groups = new Map<stream_type, Track[]>()

  for (const t of tracks) {
    const existing = groups.get(t.stream_type) ?? []
    existing.push(t)
    groups.set(t.stream_type, existing)
  }

  return groups
}

function primaryLabel(kind: stream_type, track: Track | undefined) {
  if (!track) {
    if (kind === 'subtitle') {
      return 'Off'
    }

    return 'None'
  }

  return trackPrimary(track)
}

function trackPrimary(track: Track) {
  if (track.stream_type === 'video') {
    if (track.height) {
      return `${track.height}p`
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

function trackSecondary(track: Track) {
  const parts: string[] = []

  if (track.codec_name) {
    parts.push(track.codec_name)
  }

  if (track.stream_type === 'video' && track.width && track.height) {
    parts.push(`${track.width}×${track.height}`)
  }

  if (track.is_default) {
    parts.push('default')
  }

  return parts.join(' · ')
}

function normalizeLang(code: string) {
  return code.slice(0, 3).toLowerCase()
}

function displayLang(code: string) {
  const map: Record<string, string> = {
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

  return map[code.toLowerCase()] ?? code.toUpperCase()
}
