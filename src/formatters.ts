import type { Selectable } from '@lobomfz/db'

import type { DB, download_status } from '@/db/connection'
import type { DbMedia } from '@/db/media'

type MediaTrack = Selectable<DB['media_tracks']>

type TrackDisplay = Pick<
  MediaTrack,
  | 'stream_index'
  | 'stream_type'
  | 'codec_name'
  | 'language'
  | 'title'
  | 'width'
  | 'height'
  | 'channel_layout'
  | 'is_default'
>

interface ScanFile extends Selectable<DB['media_files']> {
  tracks: MediaTrack[]
}

const DOWNLOAD_STATUS_MAP: Record<download_status, string> = {
  downloading: 'downloading',
  seeding: 'downloading',
  paused: 'downloading',
  completed: 'downloaded',
  error: '—',
}

export const Formatters = {
  mediaTitle(media: {
    title: string
    year: number | null
    indexer_source?: string | null
  }) {
    const base = media.year ? `${media.title} (${media.year})` : media.title

    if (media.indexer_source) {
      return `${base} [${media.indexer_source}]`
    }

    return base
  },

  progress(ratio: number) {
    return `${(ratio * 100).toFixed(1)}%`
  },

  size(bytes: number) {
    const gb = bytes / 1_000_000_000

    if (gb >= 1) {
      return `${gb.toFixed(1)}GB`
    }

    return `${(bytes / 1_000_000).toFixed(0)}MB`
  },

  speed(bytesPerSec: number) {
    const mb = bytesPerSec / 1_000_000

    if (mb >= 1) {
      return `${mb.toFixed(1)}MB/s`
    }

    return `${(bytesPerSec / 1_000).toFixed(0)}KB/s`
  },

  scanResult(files: ScanFile[]) {
    const lines: string[] = []

    for (const f of files) {
      const name = f.path.split('/').at(-1)
      const duration = f.duration ? `${(f.duration / 60).toFixed(1)}min` : '?'

      lines.push(
        `${name} (${Formatters.size(f.size)}, ${f.format_name ?? '?'}, ${duration})`
      )

      for (const t of f.tracks) {
        lines.push(Formatters.trackParts(t, '  ').join(' '))
      }
    }

    return lines.join('\n')
  },

  extractResult(tracks: MediaTrack[], failed: { id: number; error: string }[]) {
    const failedMap = new Map(failed.map((f) => [f.id, f.error]))
    const lines: string[] = []

    for (const t of tracks) {
      const parts = Formatters.trackParts(t)

      const error = failedMap.get(t.id)

      if (error) {
        parts.push('[FAILED]', error)
      } else if (t.path) {
        parts.push('→', t.path.split('/').at(-1)!)
      }

      lines.push(parts.join(' '))
    }

    return lines.join('\n')
  },

  eta(seconds: number) {
    if (seconds <= 0 || seconds >= 8640000) {
      return '—'
    }

    if (seconds < 60) {
      return `${seconds}s`
    }

    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}min`
    }

    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)

    if (m > 0) {
      return `${h}h ${m}min`
    }

    return `${h}h`
  },

  mediaStatus(media: {
    file_count: number
    track_count: number
    extracted_count: number
    download_status: download_status | null
  }) {
    if (media.file_count > 0 && media.track_count > 0) {
      if (media.extracted_count === media.track_count) {
        return 'extracted'
      }

      if (media.extracted_count > 0) {
        return `${media.extracted_count}/${media.track_count} extracted`
      }

      return 'scanned'
    }

    if (media.download_status) {
      return DOWNLOAD_STATUS_MAP[media.download_status]
    }

    return '—'
  },

  mediaInfo(info: NonNullable<Awaited<ReturnType<typeof DbMedia.getInfo>>>) {
    const lines: string[] = [
      `[${info.media_type}] ${Formatters.mediaTitle(info)}`,
    ]

    for (const d of info.downloads) {
      lines.push('')

      const header: string[] = [d.status]

      if (
        d.status === 'downloading' ||
        d.status === 'seeding' ||
        d.status === 'paused'
      ) {
        header.push(Formatters.progress(d.progress))
        header.push(Formatters.speed(d.speed))
        header.push(`ETA ${Formatters.eta(d.eta)}`)
      }

      if (d.status === 'error' && d.error_at) {
        header.push(d.error_at)
      }

      lines.push(header.join('  '))

      for (const f of d.files) {
        const duration = f.duration ? `${(f.duration / 60).toFixed(1)}min` : '?'

        lines.push(
          `  ${f.path} (${Formatters.size(f.size)}, ${f.format_name ?? '?'}, ${duration})`
        )

        for (const t of f.tracks) {
          const parts = Formatters.trackParts(t, '    ')

          if (t.path) {
            parts.push('✓')
          }

          lines.push(parts.join(' '))
        }
      }
    }

    return lines.join('\n')
  },

  trackParts(t: TrackDisplay, prefix = '') {
    const parts = [`${prefix}#${t.stream_index}`, t.stream_type, t.codec_name]

    if (t.language) {
      parts.push(t.language)
    }

    if (t.title) {
      parts.push(`"${t.title}"`)
    }

    if (t.width && t.height) {
      parts.push(`${t.width}x${t.height}`)
    }

    if (t.channel_layout) {
      parts.push(t.channel_layout)
    }

    if (t.is_default) {
      parts.push('[default]')
    }

    return parts
  },
}
