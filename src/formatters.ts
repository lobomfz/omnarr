export const Formatters = {
  mediaTitle(media: { title: string; year: number | null }) {
    if (media.year) {
      return `${media.title} (${media.year})`
    }

    return media.title
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
}
