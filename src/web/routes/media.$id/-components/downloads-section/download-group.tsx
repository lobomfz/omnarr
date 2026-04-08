import dayjs from 'dayjs'
import { Download, Film } from 'lucide-react'

import { Formatters } from '@/lib/formatters'
import { STATUS_BADGE } from '@/web/constants/downloads'
import { TRACK_COLOR, TRACK_ICON } from '@/web/constants/tracks'
import { cn } from '@/web/lib/cn'
import type { DownloadItem } from '@/web/types/library'

type FileItem = DownloadItem['files'][number]
type TrackItem = FileItem['tracks'][number]

export function DownloadGroup(props: {
  download: DownloadItem
  episodeLabel?: string
}) {
  const badge = STATUS_BADGE[props.download.status]
  const pct = Math.round(props.download.progress * 100)
  const name = props.download.content_path?.split('/').at(-1)
  const isDownloading = props.download.status === 'downloading'
  const isError = props.download.status === 'error'

  return (
    <div className="rounded-xl glass-liquid overflow-hidden border border-white/5">
      <div className="px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {isDownloading ? (
              <Download className="size-5 text-primary" />
            ) : (
              <Film className="size-5 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-foreground truncate">
                {name ?? props.download.source_id}
              </span>

              {props.episodeLabel && (
                <span className="text-[10px] font-mono font-medium text-muted-foreground flex-shrink-0">
                  {props.episodeLabel}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span
                className={cn(
                  'inline-flex items-center rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border flex-shrink-0',
                  badge.className
                )}
              >
                {badge.label}
              </span>

              {isDownloading && (
                <span className="text-[10px] font-bold text-primary">
                  {pct}%
                  {props.download.speed > 0 && (
                    <span className="text-muted-foreground ml-1.5">
                      {Formatters.speed(props.download.speed)}
                    </span>
                  )}
                </span>
              )}

              {isError && props.download.error_at && (
                <span className="text-[10px] text-muted-foreground">
                  {dayjs(props.download.error_at).format('YYYY-MM-DD')}
                </span>
              )}
            </div>
          </div>
        </div>

        {isDownloading && (
          <div className="mt-4 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {props.download.files.length > 0 && (
        <div className="border-t border-white/5 bg-white/[0.02]">
          {props.download.files.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </div>
      )}
    </div>
  )
}

function FileRow(props: { file: FileItem }) {
  const fileName = props.file.path.split('/').at(-1) ?? props.file.path
  const videoTrack = props.file.tracks.find((t) => t.stream_type === 'video')
  const audioTracks = props.file.tracks.filter((t) => t.stream_type === 'audio')
  const subtitleTracks = props.file.tracks.filter(
    (t) => t.stream_type === 'subtitle'
  )

  return (
    <div className="px-6 py-4 border-b border-white/5 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-foreground truncate">
          {fileName}
        </span>

        <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground flex-shrink-0">
          {props.file.duration && (
            <span>{Formatters.duration(props.file.duration)}</span>
          )}
          {props.file.size && <span>{Formatters.size(props.file.size)}</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {videoTrack && (
          <TrackBadge
            track={videoTrack}
            label={`${videoTrack.width}x${videoTrack.height} ${videoTrack.codec_name}`}
          />
        )}
        {audioTracks.map((t) => (
          <TrackBadge
            key={t.stream_index}
            track={t}
            label={[t.codec_name, t.channel_layout, t.language]
              .filter(Boolean)
              .join(' \u00B7 ')}
          />
        ))}
        {subtitleTracks.map((t) => (
          <TrackBadge
            key={t.stream_index}
            track={t}
            label={[t.language ?? 'subtitle', t.codec_name]
              .filter(Boolean)
              .join(' \u00B7 ')}
          />
        ))}
        {props.file.has_keyframes && (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Keyframes
          </span>
        )}
        {props.file.has_vad && (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            VAD
          </span>
        )}
      </div>
    </div>
  )
}

function TrackBadge(props: { track: TrackItem; label: string }) {
  const Icon = TRACK_ICON[props.track.stream_type]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium border',
        TRACK_COLOR[props.track.stream_type]
      )}
    >
      <Icon className="size-2.5" />
      {props.label}
    </span>
  )
}
