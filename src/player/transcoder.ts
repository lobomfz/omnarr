import { access } from 'fs/promises'

import { FFmpegBuilder, type Preset } from '@lobomfz/ffmpeg'

const HLS_VIDEO_CODECS = new Set(['h264'])
const HLS_AUDIO_CODECS = new Set(['aac', 'ac3', 'eac3'])
const VAAPI_DEVICE = '/dev/dri/renderD128'

type TracksInput = {
  video: { codec_name: string }
  audio: { codec_name: string; channels?: number | null }
}

type TranscodeConfig = { video_crf: number; video_preset: Preset }

export type TranscodeFn = (builder: FFmpegBuilder) => FFmpegBuilder

export class Transcoder {
  constructor(
    private tracks: TracksInput,
    private builder: FFmpegBuilder,
    private HAS_VAAPI: boolean
  ) {}

  static async init(tracks: TracksInput, config: TranscodeConfig) {
    const HAS_VAAPI = await access(VAAPI_DEVICE).then(
      () => true,
      () => false
    )

    return (builder: FFmpegBuilder) =>
      new Transcoder(tracks, builder, HAS_VAAPI).parse(config)
  }

  parse(config: TranscodeConfig) {
    this.applyVideo(config)
    this.applyAudio()

    return this.builder
  }

  private applyVideo(config: TranscodeConfig) {
    if (HLS_VIDEO_CODECS.has(this.tracks.video.codec_name)) {
      this.builder = this.builder.codec('v', 'copy')
      return
    }

    if (this.HAS_VAAPI) {
      this.builder = this.builder
        .hwaccel('vaapi')
        .vaapiDevice(VAAPI_DEVICE)
        .codec('v', 'h264_vaapi')
        .raw('-qp', String(config.video_crf))
      return
    }

    this.builder = this.builder
      .hwaccel('auto')
      .codec('v', 'libx264')
      .crf(config.video_crf)
      .preset(config.video_preset)
  }

  private applyAudio() {
    if (HLS_AUDIO_CODECS.has(this.tracks.audio.codec_name)) {
      this.builder = this.builder.codec('a', 'copy')
      return
    }

    this.builder = this.builder.codec('a', 'aac')

    if (this.tracks.audio.channels != null) {
      this.builder = this.builder.raw('-ac', String(this.tracks.audio.channels))
    }
  }
}
