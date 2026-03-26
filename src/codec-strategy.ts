import type { Preset } from '@lobomfz/ffmpeg'

const HLS_VIDEO_CODECS = ['h264']
const HLS_AUDIO_CODECS = ['aac', 'ac3', 'eac3']

function resolveVideo(
  codec: string,
  config: { video_crf: number; video_preset: Preset }
) {
  if (HLS_VIDEO_CODECS.includes(codec)) {
    return { mode: 'copy' as const }
  }

  return {
    mode: 'transcode' as const,
    codec: 'libx264' as const,
    crf: config.video_crf,
    preset: config.video_preset,
  }
}

function resolveAudio(codec: string, channels?: number | null) {
  if (HLS_AUDIO_CODECS.includes(codec)) {
    return { mode: 'copy' as const }
  }

  if (channels != null) {
    return { mode: 'transcode' as const, codec: 'aac' as const, channels }
  }

  return { mode: 'transcode' as const, codec: 'aac' as const }
}

export const CodecStrategy = {
  HLS_VIDEO_CODECS,
  HLS_AUDIO_CODECS,

  resolve(
    tracks: {
      video: { codec_name: string }
      audio: { codec_name: string; channels?: number | null }
    },
    config: { video_crf: number; video_preset: Preset }
  ) {
    return {
      video: resolveVideo(tracks.video.codec_name, config),
      audio: resolveAudio(tracks.audio.codec_name, tracks.audio.channels),
    }
  },
}
