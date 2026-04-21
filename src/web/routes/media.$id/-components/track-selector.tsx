import type { stream_type } from '@/db/connection'
import { TRACK_COLOR, TRACK_ICON } from '@/web/constants/tracks'
import { cn } from '@/web/lib/cn'

import type { Track, TrackSelection } from '../-utils/use-track-selection'

const STREAM_TYPE_ORDER: stream_type[] = ['video', 'audio', 'subtitle']

const STREAM_TYPE_LABEL: Record<stream_type, string> = {
  video: 'Video',
  audio: 'Audio',
  subtitle: 'Subtitles',
}

export function TrackSelector(props: {
  tracks: Track[]
  selection: TrackSelection
}) {
  if (props.tracks.length === 0) {
    return (
      <div
        data-component="track-selector-empty"
        className="text-sm text-muted-foreground text-center py-8"
      >
        No scanned tracks available. Run a scan first.
      </div>
    )
  }

  const grouped = new Map<stream_type, Track[]>()

  for (const track of props.tracks) {
    const existing = grouped.get(track.stream_type) ?? []
    existing.push(track)
    grouped.set(track.stream_type, existing)
  }

  return (
    <div data-component="track-selector" className="space-y-4">
      {STREAM_TYPE_ORDER.filter((type) => grouped.has(type)).map((type) => (
        <TrackGroup
          key={type}
          type={type}
          tracks={grouped.get(type)!}
          selectedId={props.selection[type]}
          onSelect={(id) => props.selection.select(type, id)}
        />
      ))}
    </div>
  )
}

function TrackGroup(props: {
  type: stream_type
  tracks: Track[]
  selectedId: number | undefined
  onSelect: (id?: number) => void
}) {
  const Icon = TRACK_ICON[props.type]

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {STREAM_TYPE_LABEL[props.type]}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {props.tracks.map((track) => {
          const selected = props.selectedId === track.id
          const isSubtitle = props.type === 'subtitle'

          return (
            <button
              key={track.id}
              type="button"
              data-component="track-option"
              data-track-id={String(track.id)}
              data-stream-type={track.stream_type}
              data-selected={String(selected)}
              onClick={() => {
                if (isSubtitle && selected) {
                  props.onSelect()
                } else {
                  props.onSelect(track.id)
                }
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border transition-colors duration-150 cursor-pointer',
                selected
                  ? TRACK_COLOR[props.type]
                  : 'bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10'
              )}
            >
              {formatTrackLabel(track)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function formatTrackLabel(track: Track) {
  const parts: string[] = []

  if (track.stream_type === 'video' && track.width && track.height) {
    parts.push(`${track.width}x${track.height}`)
  }

  if (track.codec_name) {
    parts.push(track.codec_name)
  }

  if (track.channel_layout) {
    parts.push(track.channel_layout)
  }

  if (track.language) {
    parts.push(track.language)
  }

  return parts.join(' \u00B7 ')
}
