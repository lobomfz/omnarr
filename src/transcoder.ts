import { access } from 'fs/promises'

import type { FFmpegBuilder, Preset } from '@lobomfz/ffmpeg'

const HLS_VIDEO_CODECS = new Set(['h264'])
const HLS_AUDIO_CODECS = new Set(['aac', 'ac3', 'eac3'])
const VAAPI_DEVICE = '/dev/dri/renderD128'

type VideoStrategy =
  | { mode: 'copy' }
  | { mode: 'transcode'; codec: 'libx264'; crf: number; preset: Preset }
  | { mode: 'transcode'; codec: 'h264_vaapi'; qp: number }

type AudioStrategy =
  | { mode: 'copy' }
  | { mode: 'transcode'; codec: 'aac'; channels?: number }

export class Transcoder {
  private constructor(
    private video: VideoStrategy,
    private audio: AudioStrategy
  ) {}

  static async create(
    tracks: {
      video: { codec_name: string }
      audio: { codec_name: string; channels?: number | null }
    },
    config: { video_crf: number; video_preset: Preset }
  ) {
    const hasVaapi = await access(VAAPI_DEVICE).then(
      () => true,
      () => false
    )

    const video: VideoStrategy = HLS_VIDEO_CODECS.has(tracks.video.codec_name)
      ? { mode: 'copy' }
      : hasVaapi
        ? { mode: 'transcode', codec: 'h264_vaapi', qp: config.video_crf }
        : {
            mode: 'transcode',
            codec: 'libx264',
            crf: config.video_crf,
            preset: config.video_preset,
          }

    const audio: AudioStrategy = HLS_AUDIO_CODECS.has(tracks.audio.codec_name)
      ? { mode: 'copy' }
      : tracks.audio.channels == null
        ? { mode: 'transcode', codec: 'aac' }
        : { mode: 'transcode', codec: 'aac', channels: tracks.audio.channels }

    return new Transcoder(video, audio)
  }

  apply(builder: FFmpegBuilder) {
    if (this.video.mode === 'copy') {
      builder = builder.codec('v', 'copy')
    } else if (this.video.codec === 'h264_vaapi') {
      builder = builder
        .hwaccel('vaapi')
        .vaapiDevice(VAAPI_DEVICE)
        .codec('v', 'h264_vaapi')
        .raw('-qp', String(this.video.qp))
    } else {
      builder = builder
        .hwaccel('auto')
        .codec('v', this.video.codec)
        .crf(this.video.crf)
        .preset(this.video.preset)
    }

    if (this.audio.mode === 'transcode') {
      builder = builder.codec('a', this.audio.codec)

      if (this.audio.channels != null) {
        builder = builder.raw('-ac', String(this.audio.channels))
      }
    } else {
      builder = builder.codec('a', 'copy')
    }

    return builder
  }
}
