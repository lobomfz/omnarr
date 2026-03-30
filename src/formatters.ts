import type { Selectable } from '@lobomfz/db'

import type { DB, download_status } from '@/db/connection'
import type { MediaInfo } from '@/db/media'

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
  seasonEpisodeTag(
    seasonNumber: number | null | undefined,
    episodeNumber: number | null | undefined
  ) {
    if (seasonNumber == null) {
      return ''
    }

    const s = `S${String(seasonNumber).padStart(2, '0')}`

    if (episodeNumber == null) {
      return s
    }

    return `${s}E${String(episodeNumber).padStart(2, '0')}`
  },

  mediaTitle(media: {
    title: string
    year: number | null
    indexer_source?: string | null
    season_number?: number | null
    episode_number?: number | null
  }) {
    let base = media.year ? `${media.title} (${media.year})` : media.title

    const seTag = Formatters.seasonEpisodeTag(
      media.season_number,
      media.episode_number
    )

    if (seTag) {
      base = `${base} - ${seTag}`
    }

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

  fileStats(f: {
    size: number
    format_name: string | null
    duration: number | null
  }) {
    const duration = f.duration ? `${(f.duration / 60).toFixed(1)}min` : '?'

    return `${Formatters.size(f.size)}, ${f.format_name ?? '?'}, ${duration}`
  },

  scanResult(files: ScanFile[]) {
    const lines: string[] = []

    for (const f of files) {
      lines.push(`${f.path.split('/').at(-1)} (${Formatters.fileStats(f)})`)

      for (const t of f.tracks) {
        lines.push(Formatters.trackParts(t, '  ').join(' '))
      }
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
    download_status: download_status | null
    total_episodes: number | null
    episodes_with_files: number | null
  }) {
    if (media.total_episodes) {
      return `${media.episodes_with_files ?? 0}/${media.total_episodes} episodes`
    }

    if (media.file_count > 0 && media.track_count > 0) {
      return 'scanned'
    }

    if (media.download_status) {
      return DOWNLOAD_STATUS_MAP[media.download_status]
    }

    return '—'
  },

  mediaInfo(info: MediaInfo) {
    const lines: string[] = [
      `[${info.media_type}] ${Formatters.mediaTitle(info)}`,
    ]

    if (info.media_type === 'tv') {
      Formatters.appendSeasons(lines, info.seasons)
    } else {
      Formatters.appendDownloads(lines, info.downloads)
    }

    return lines.join('\n')
  },

  appendDownloads(lines: string[], downloads: MediaInfo['downloads']) {
    for (const d of downloads) {
      lines.push('')

      const header: string[] = [d.status]

      if (DOWNLOAD_STATUS_MAP[d.status] === 'downloading') {
        header.push(Formatters.progress(d.progress))
        header.push(Formatters.speed(d.speed))
        header.push(`ETA ${Formatters.eta(d.eta)}`)
      }

      if (d.status === 'error' && d.error_at) {
        header.push(d.error_at)
      }

      lines.push(header.join('  '))

      for (const f of d.files) {
        lines.push(`  ${f.path} (${Formatters.fileStats(f)})`)

        const typeCounters: Record<string, number> = {}

        for (const t of f.tracks) {
          const idx = typeCounters[t.stream_type] ?? 0
          typeCounters[t.stream_type] = idx + 1
          lines.push(Formatters.trackParts(t, '    ', idx).join(' '))
        }
      }
    }
  },

  appendSeasons(lines: string[], seasons: MediaInfo['seasons']) {
    for (const s of seasons) {
      const downloaded = s.episodes.filter((e) => e.files.length > 0)

      if (downloaded.length === 0) {
        continue
      }

      lines.push('')

      const seasonLabel =
        s.season_number === 0
          ? 'Specials'
          : (s.title ?? `Season ${s.season_number}`)

      lines.push(seasonLabel)

      for (const e of downloaded) {
        const epNum = `E${String(e.episode_number).padStart(2, '0')}`
        const epTitle = e.title ? `  ${e.title}` : ''

        lines.push(`  ${epNum}${epTitle}`)

        for (const f of e.files) {
          lines.push(
            `    ${f.path.split('/').at(-1)} (${Formatters.fileStats(f)})`
          )

          const typeCounters: Record<string, number> = {}

          for (const t of f.tracks) {
            const idx = typeCounters[t.stream_type] ?? 0
            typeCounters[t.stream_type] = idx + 1
            lines.push(Formatters.trackParts(t, '      ', idx).join(' '))
          }
        }
      }
    }
  },

  trackSummary(
    label: string,
    t: {
      codec_name: string
      width: number | null
      height: number | null
      channel_layout: string | null
      language: string | null
    }
  ) {
    const parts = [`${label}:`, t.codec_name]

    if (t.width && t.height) {
      parts.push(`${t.width}x${t.height}`)
    }

    if (t.channel_layout) {
      parts.push(t.channel_layout)
    }

    if (t.language) {
      parts.push(t.language)
    }

    return parts.join(' ')
  },

  trackParts(t: TrackDisplay, prefix = '', typeIndex?: number) {
    const parts: string[] = []

    if (typeIndex === undefined) {
      parts.push(`${prefix}#${t.stream_index}`, t.stream_type)
    } else {
      parts.push(`${prefix}${t.stream_type} ${typeIndex}:`)
    }

    parts.push(t.codec_name)

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
