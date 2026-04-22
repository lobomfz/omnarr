import type { stream_type } from '@/db/connection'
import type { MediaInfo } from '@/web/types/library'

export type Track =
  MediaInfo['downloads'][number]['files'][number]['tracks'][number]

type TrackPatch = {
  video?: number
  audio?: number
  sub?: number
}

type TrackSearch = {
  video?: number
  audio?: number
  sub?: number
}

export type TrackSelection = {
  video: number | undefined
  audio: number | undefined
  subtitle: number | undefined
  select: (type: stream_type, id?: number) => void
}

export function useTrackSelection(
  tracks: Track[],
  search: TrackSearch,
  onChange: (patch: TrackPatch) => void
): TrackSelection {
  const videoTracks = tracks.filter((t) => t.stream_type === 'video')
  const audioTracks = tracks.filter((t) => t.stream_type === 'audio')
  const subtitleTracks = tracks.filter((t) => t.stream_type === 'subtitle')

  const defaultVideo =
    videoTracks.find((t) => t.is_default) ?? videoTracks.at(0)
  const defaultAudio =
    audioTracks.find((t) => t.is_default) ?? audioTracks.at(0)

  const video =
    videoTracks.find((t) => t.id === search.video)?.id ?? defaultVideo?.id
  const audio =
    audioTracks.find((t) => t.id === search.audio)?.id ?? defaultAudio?.id
  const subtitle = subtitleTracks.find((t) => t.id === search.sub)?.id

  return {
    video,
    audio,
    subtitle,
    select: (type, id) => {
      switch (type) {
        case 'video':
          return onChange({ video: id })
        case 'audio':
          return onChange({ audio: id })
        case 'subtitle':
          return onChange({ sub: id })
      }
    },
  }
}
