import { FileAudio, FileText, FileVideo } from 'lucide-react'

import type { stream_type } from '@/db/connection'

export const TRACK_ICON: Record<stream_type, typeof FileVideo> = {
  video: FileVideo,
  audio: FileAudio,
  subtitle: FileText,
}

export const TRACK_COLOR: Record<stream_type, string> = {
  video: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  audio: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  subtitle: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
}
