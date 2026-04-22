import { AudioCorrelator, MIN_SYNC_CONFIDENCE } from '@/audio/audio-correlator'
import {
  bestCorrelation,
  computeRuntimeSeconds,
  detectSpeed,
  refineCorrelation,
} from '@/audio/correlation-refine'
import { SubtitleExtractor } from '@/audio/subtitle-extractor'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'
import { Log } from '@/lib/log'
import { Parsers } from '@/lib/parsers'
import { OmnarrError } from '@/shared/errors'

type TrackRef = { id: number; media_file_id: number }

type AudioCorrelationResult = ReturnType<typeof bestCorrelation>

type AudioSync = {
  offset: number
  confidence: number | null
  speed: number
  applied: boolean
}

type SubtitleSync = {
  offset: number
  confidence: number | null
  speed: number
}

interface ConfidentSubtitleSync {
  offset: number
  confidence: number
  speed: number
}

const SYNC_SKIPPED: Readonly<AudioSync> = Object.freeze({
  offset: 0,
  confidence: null,
  speed: 1,
  applied: false,
})

const SUBTITLE_SKIPPED: Readonly<SubtitleSync> = Object.freeze({
  offset: 0,
  confidence: null,
  speed: 1,
})

export class TrackResolver {
  constructor(protected media: { id: string; episode_id?: number | null }) {}

  protected async getTracks() {
    const allTracks = await DbMediaTracks.getWithFile({
      media_id: this.media.id,
      episode_id: this.media.episode_id,
    })

    if (allTracks.length === 0) {
      throw new OmnarrError('NO_TRACKS')
    }

    return Map.groupBy(allTracks, (t) => t.stream_type)
  }

  async resolveOffset(videoTrackId: number, audioTrackId: number) {
    const [referenceTrack, audioTrack] = await Promise.all([
      this.resolveReferenceAudioTrack(videoTrackId, audioTrackId),
      DbMediaTracks.getById(audioTrackId),
    ])

    if (!referenceTrack || !audioTrack) {
      Log.warn('audio sync skipped: missing track context')

      return SYNC_SKIPPED
    }

    return await this.computeAudioSync(referenceTrack, audioTrack)
  }

  async resolvePlayback(input: {
    video: { id: number; download_id: number; file_id: number }
    audio: { id: number; download_id: number; file_id: number }
    subtitle: {
      file_id: number
      file_path: string
      stream_index: number
    } | null
  }) {
    const sameDownload = input.video.download_id === input.audio.download_id

    const [audioTrack, referenceTrack] = await Promise.all([
      DbMediaTracks.getById(input.audio.id),
      sameDownload
        ? Promise.resolve(null)
        : this.resolveReferenceAudioTrack(input.video.id, input.audio.id),
    ])

    const audioSync: AudioSync =
      sameDownload || !referenceTrack || !audioTrack
        ? SYNC_SKIPPED
        : await this.computeAudioSync(referenceTrack, audioTrack)

    if (!input.subtitle) {
      return { audioSync, subtitleSync: SUBTITLE_SKIPPED }
    }

    const sameSource =
      input.subtitle.file_id === input.audio.file_id &&
      input.audio.file_id === input.video.file_id

    if (sameSource) {
      return { audioSync, subtitleSync: SUBTITLE_SKIPPED }
    }

    const subtitleSync = await this.resolveSubtitleSync({
      referenceTrack,
      audioTrack,
      audioSync,
      subtitlePath: input.subtitle.file_path,
      subtitleStreamIndex: input.subtitle.stream_index,
    })

    return { audioSync, subtitleSync }
  }

  async correlateSubtitle(
    vadTrackId: number,
    srtPath: string,
    subtitleStreamIndex?: number
  ) {
    const [vad, vadTrack] = await Promise.all([
      DbMediaVad.loadVad(vadTrackId),
      DbMediaTracks.getById(vadTrackId),
    ])

    if (!vad || !vadTrack) {
      return SUBTITLE_SKIPPED
    }

    const vadFile = await DbMediaFiles.getById(vadTrack.media_file_id)
    const srtContent = await SubtitleExtractor.readContent(
      srtPath,
      subtitleStreamIndex
    )

    if (srtContent === null) {
      return SUBTITLE_SKIPPED
    }

    const srtTimestamps = Parsers.srtTimestamps(srtContent)

    if (srtTimestamps.length === 0) {
      return SUBTITLE_SKIPPED
    }

    const srtDuration = srtTimestamps.at(-1) ?? 0
    const fileSpeed = detectSpeed(vadFile?.duration, srtDuration)
    const best = bestCorrelation(
      vad,
      srtTimestamps,
      fileSpeed,
      AudioCorrelator.correlateOnsets
    )
    const refined =
      best.speed === 1
        ? null
        : refineCorrelation({
            reference: vad,
            target: srtTimestamps,
            runtimeSeconds: computeRuntimeSeconds(
              vad.at(-1),
              srtDuration / best.speed,
              vadFile?.duration
            ),
            speed: best.speed,
            confidence: best.confidence,
            correlate: AudioCorrelator.correlateOnsets,
          })
    const resolved = refined ?? best

    return {
      offset: resolved.offsetSeconds,
      confidence: resolved.confidence,
      speed: resolved.speed,
    }
  }

  private async computeAudioSync(
    referenceTrack: TrackRef,
    audioTrack: TrackRef
  ): Promise<AudioSync> {
    if (referenceTrack.id === audioTrack.id) {
      return SYNC_SKIPPED
    }

    const [vadVideo, vadAudio, videoFile, audioFile] = await Promise.all([
      DbMediaVad.loadVad(referenceTrack.id),
      DbMediaVad.loadVad(audioTrack.id),
      DbMediaFiles.getById(referenceTrack.media_file_id),
      DbMediaFiles.getById(audioTrack.media_file_id),
    ])

    if (!vadVideo || !vadAudio) {
      Log.warn(
        `audio sync skipped: missing vad video=${!!vadVideo} audio=${!!vadAudio}`
      )

      return SYNC_SKIPPED
    }

    const fileSpeed = detectSpeed(videoFile?.duration, audioFile?.duration)
    const best = bestCorrelation(
      vadVideo,
      vadAudio,
      fileSpeed,
      AudioCorrelator.correlateTimestamps
    )
    const refined =
      best.speed === 1
        ? null
        : refineCorrelation({
            reference: vadVideo,
            target: vadAudio,
            runtimeSeconds: computeRuntimeSeconds(
              vadVideo.at(-1),
              (vadAudio.at(-1) ?? 0) / best.speed,
              videoFile?.duration,
              audioFile?.duration
            ),
            speed: best.speed,
            confidence: best.confidence,
            correlate: AudioCorrelator.correlateTimestamps,
          })
    const resolved = refined ?? best

    if (resolved.confidence < MIN_SYNC_CONFIDENCE) {
      Log.warn(
        `audio sync skipped: low confidence=${resolved.confidence.toFixed(1)} offset=${resolved.offsetSeconds.toFixed(3)}s speed=${resolved.speed.toFixed(4)}`
      )

      return {
        offset: 0,
        confidence: resolved.confidence,
        speed: 1,
        applied: false,
      }
    }

    Log.info(
      `audio sync applied: reference_track=${referenceTrack.id} target_track=${audioTrack.id} offset=${resolved.offsetSeconds.toFixed(3)}s confidence=${resolved.confidence.toFixed(1)} speed=${resolved.speed.toFixed(4)}`
    )

    return {
      offset: resolved.offsetSeconds,
      confidence: resolved.confidence,
      speed: resolved.speed,
      applied: true,
    }
  }

  async resolveReferenceAudioTrack(videoTrackId: number, audioTrackId: number) {
    const [videoTrack, audioTrack] = await Promise.all([
      DbMediaTracks.getById(videoTrackId),
      DbMediaTracks.getById(audioTrackId),
    ])

    if (!videoTrack || !audioTrack) {
      return null
    }

    if (videoTrack.media_file_id === audioTrack.media_file_id) {
      return audioTrack
    }

    const fileTracks = await DbMediaTracks.getByMediaFileId(
      videoTrack.media_file_id
    )
    const audioTracks = fileTracks.filter(
      (track) => track.stream_type === 'audio'
    )

    if (audioTracks.length === 0) {
      return null
    }

    const firstTrack = audioTracks.at(0)
    const defaultTrack = audioTracks.find((track) => track.is_default)
    const languageTrack = audioTrack.language
      ? audioTracks.find((track) => track.language === audioTrack.language)
      : undefined
    const present = [defaultTrack, firstTrack, languageTrack].filter(
      (track) => track !== undefined
    )
    const candidates = [
      ...new Map(present.map((track) => [track.id, track])).values(),
    ]

    return await this.pickBestCandidate(candidates, audioTrack)
  }

  private async pickBestCandidate<T extends TrackRef>(
    candidates: T[],
    audioTrack: TrackRef
  ) {
    const results = await Promise.all(
      candidates.map(async (track) => ({
        track,
        result: await this.correlateAudioTracks(track, audioTrack),
      }))
    )

    const best = results
      .filter(
        (r): r is { track: T; result: AudioCorrelationResult } =>
          r.result !== null
      )
      .sort((a, b) => b.result.confidence - a.result.confidence)
      .at(0)

    if (!best) {
      return null
    }

    return best.track
  }

  private async correlateAudioTracks(
    referenceTrack: TrackRef,
    audioTrack: TrackRef
  ) {
    const [referenceVad, audioVad, referenceFile, audioFile] =
      await Promise.all([
        DbMediaVad.loadVad(referenceTrack.id),
        DbMediaVad.loadVad(audioTrack.id),
        DbMediaFiles.getById(referenceTrack.media_file_id),
        DbMediaFiles.getById(audioTrack.media_file_id),
      ])

    if (!referenceVad || !audioVad) {
      return null
    }

    return bestCorrelation(
      referenceVad,
      audioVad,
      detectSpeed(referenceFile?.duration, audioFile?.duration),
      AudioCorrelator.correlateTimestamps
    )
  }

  private async resolveSubtitleSync(input: {
    referenceTrack: TrackRef | null
    audioTrack: TrackRef | undefined
    audioSync: AudioSync
    subtitlePath: string
    subtitleStreamIndex: number
  }): Promise<SubtitleSync> {
    if (!input.audioTrack) {
      return SUBTITLE_SKIPPED
    }

    const candidates: SubtitleSync[] = []

    if (input.referenceTrack) {
      const referenceSubtitle = await this.correlateSubtitle(
        input.referenceTrack.id,
        input.subtitlePath,
        input.subtitleStreamIndex
      )

      candidates.push(referenceSubtitle)
    }

    if (
      !input.referenceTrack ||
      input.referenceTrack.id !== input.audioTrack.id
    ) {
      const audioSubtitle = await this.correlateSubtitle(
        input.audioTrack.id,
        input.subtitlePath,
        input.subtitleStreamIndex
      )

      if (input.referenceTrack) {
        if (input.audioSync.applied && audioSubtitle.confidence !== null) {
          candidates.push({
            offset:
              audioSubtitle.offset / input.audioSync.speed +
              input.audioSync.offset,
            confidence:
              input.audioSync.confidence === null
                ? audioSubtitle.confidence
                : Math.min(
                    audioSubtitle.confidence,
                    input.audioSync.confidence
                  ),
            speed: audioSubtitle.speed * input.audioSync.speed,
          })
        }
      } else {
        candidates.push(audioSubtitle)
      }
    }

    const best = candidates
      .filter((c): c is ConfidentSubtitleSync => c.confidence !== null)
      .sort((a, b) => b.confidence - a.confidence)
      .at(0)

    if (!best) {
      return SUBTITLE_SKIPPED
    }

    if (best.confidence < MIN_SYNC_CONFIDENCE) {
      return {
        offset: 0,
        confidence: best.confidence,
        speed: 1,
      }
    }

    return {
      offset: best.offset,
      confidence: best.confidence,
      speed: best.speed,
    }
  }
}
