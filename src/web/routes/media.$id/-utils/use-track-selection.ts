import { useEffect, useState } from 'react'

import type { stream_type } from '@/db/connection'
import type { MediaInfo } from '@/web/types/library'

export type Track =
  MediaInfo['downloads'][number]['files'][number]['tracks'][number]

export type TrackSelection = {
  video: number | undefined
  audio: number | undefined
  subtitle: number | undefined
  select: (type: stream_type, id: number | undefined) => void
}

export function useTrackSelection(tracks: Track[]): TrackSelection {
  const [video, setVideo] = useState<number | undefined>()
  const [audio, setAudio] = useState<number | undefined>()
  const [subtitle, setSubtitle] = useState<number | undefined>()

  useEffect(() => {
    const videoTracks = tracks.filter((t) => t.stream_type === 'video')
    const audioTracks = tracks.filter((t) => t.stream_type === 'audio')

    const defaultVideo = videoTracks.find((t) => t.is_default) ?? videoTracks[0]
    const defaultAudio = audioTracks.find((t) => t.is_default) ?? audioTracks[0]

    setVideo(defaultVideo?.id)
    setAudio(defaultAudio?.id)
    setSubtitle(undefined)
  }, [tracks])

  return {
    video,
    audio,
    subtitle,
    select: (type, id) => {
      const setters: Record<stream_type, (id: number | undefined) => void> = {
        video: setVideo,
        audio: setAudio,
        subtitle: setSubtitle,
      }
      setters[type](id)
    },
  }
}
