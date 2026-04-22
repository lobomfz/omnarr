import Hls from 'hls.js'
import {
  ArrowLeft,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/web/lib/cn'

const HIDE_DELAY = 3000

export function VideoPlayer(props: { hlsPath: string; onBack: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [buffering, setBuffering] = useState(true)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const video = videoRef.current

    if (!video) {
      return
    }

    if (Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(props.hlsPath)
      hls.attachMedia(video)
    } else {
      video.src = props.hlsPath
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [props.hlsPath])

  useEffect(() => {
    const video = videoRef.current

    if (!video) {
      return
    }

    const handleCanPlay = () => {
      video.play().catch(() => {})
    }

    video.addEventListener('canplay', handleCanPlay, { once: true })

    return () => {
      video.removeEventListener('canplay', handleCanPlay)
    }
  }, [props.hlsPath])

  useEffect(() => {
    const video = videoRef.current

    if (!video) {
      return
    }

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onWaiting = () => setBuffering(true)
    const onPlaying = () => setBuffering(false)
    const onCanPlay = () => setBuffering(false)
    const onTimeUpdate = () => setCurrentTime(video.currentTime)
    const onDurationChange = () => setDuration(video.duration)
    const onVolumeChange = () => {
      setVolume(video.volume)
      setMuted(video.muted)
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('volumechange', onVolumeChange)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('volumechange', onVolumeChange)
    }
  }, [])

  const handlePlayPause = useCallback(async () => {
    const video = videoRef.current

    if (!video) {
      return
    }

    if (video.paused) {
      await video.play()
    } else {
      video.pause()
    }
  }, [])

  const handleMuteToggle = useCallback(() => {
    const video = videoRef.current

    if (!video) {
      return
    }

    const next = !video.muted
    video.muted = next
  }, [])

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const video = videoRef.current

      if (!video) {
        return
      }

      const val = parseFloat(e.target.value)
      video.volume = val
      setVolume(val)

      if (val > 0 && video.muted) {
        video.muted = false
      }
    },
    []
  )

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current

    if (!video) {
      return
    }

    video.currentTime = parseFloat(e.target.value)
  }, [])

  const handleFullscreen = useCallback(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void container.requestFullscreen()
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [])

  const resetHideTimer = useCallback(() => {
    setControlsVisible(true)

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }

    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false)
    }, HIDE_DELAY)
  }, [])

  useEffect(() => {
    resetHideTimer()

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [resetHideTimer])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const video = videoRef.current

      if (!video) {
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          void handlePlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          video.currentTime = Math.max(0, video.currentTime - 10)
          break
        case 'ArrowRight':
          e.preventDefault()
          video.currentTime += 10
          break
        case 'f':
        case 'F':
          e.preventDefault()
          handleFullscreen()
          break
        case 'm':
        case 'M':
          e.preventDefault()
          handleMuteToggle()
          break
      }

      resetHideTimer()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handlePlayPause, handleFullscreen, handleMuteToggle, resetHideTimer])

  return (
    <div
      ref={containerRef}
      data-component="video-player"
      data-playing={String(playing)}
      data-muted={String(muted)}
      data-buffering={String(buffering)}
      data-volume={String(volume)}
      data-current-time={String(currentTime)}
      data-duration={String(duration)}
      data-controls-visible={String(controlsVisible)}
      data-cursor-hidden={String(!controlsVisible)}
      className={cn(
        'relative bg-black w-full h-full',
        !controlsVisible && 'cursor-none'
      )}
      onMouseMove={resetHideTimer}
    >
      <video
        ref={videoRef}
        data-slot="video"
        className="absolute inset-0 w-full h-full object-contain"
        muted
        playsInline
      />

      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="size-12 animate-spin text-white/70" />
        </div>
      )}

      <div
        className={cn(
          'absolute inset-0 flex flex-col justify-between transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center p-4">
          <button
            type="button"
            data-slot="back-button"
            onClick={props.onBack}
            className="flex items-center justify-center size-10 rounded-full bg-black/40 backdrop-blur-sm text-white transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-5" />
          </button>
        </div>

        <div className="p-4 bg-gradient-to-t from-black/80 to-transparent space-y-3">
          <input
            type="range"
            data-slot="seek-bar"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 appearance-none bg-white/20 rounded-full cursor-pointer accent-white"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-slot="play-pause"
                onClick={handlePlayPause}
                className="flex items-center justify-center size-10 rounded-full text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {playing && <Pause className="size-5 fill-current" />}
                {!playing && <Play className="size-5 fill-current" />}
              </button>

              <button
                type="button"
                data-slot="mute-toggle"
                onClick={handleMuteToggle}
                className="flex items-center justify-center size-10 rounded-full text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {muted && <VolumeX className="size-5" />}
                {!muted && <Volume2 className="size-5" />}
              </button>

              <input
                type="range"
                data-slot="volume-slider"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 appearance-none bg-white/20 rounded-full cursor-pointer accent-white"
              />

              <span className="text-xs text-white/70 tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-slot="fullscreen-toggle"
                onClick={handleFullscreen}
                className="flex items-center justify-center size-10 rounded-full text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {fullscreen && <Minimize className="size-5" />}
                {!fullscreen && <Maximize className="size-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return `${m}:${String(s).padStart(2, '0')}`
}
