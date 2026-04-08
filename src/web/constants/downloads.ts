import type { download_status } from '@/db/connection'

export const STATUS_BADGE: Record<
  download_status,
  { label: string; className: string }
> = {
  downloading: {
    label: 'Downloading',
    className: 'bg-primary/15 text-primary border-primary/30',
  },
  seeding: {
    label: 'Seeding',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  paused: {
    label: 'Paused',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  pending: {
    label: 'Pending',
    className: 'bg-white/5 text-muted-foreground border-white/10',
  },
  processing: {
    label: 'Processing',
    className: 'bg-primary/15 text-primary border-primary/30',
  },
  error: {
    label: 'Error',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
}
