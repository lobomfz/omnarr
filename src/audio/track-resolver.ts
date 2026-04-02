import { AudioCorrelator, MIN_SYNC_CONFIDENCE } from '@/audio/audio-correlator'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'
import { Log } from '@/lib/log'
import { Parsers } from '@/lib/parsers'

export class TrackResolver {
  constructor(protected media: { id: string; episode_id?: number }) {}

  protected async getTracks() {
    const allTracks = await DbMediaTracks.getWithFile({
      media_id: this.media.id,
      episode_id: this.media.episode_id,
    })

    if (allTracks.length === 0) {
      throw new Error('No tracks found. Run scan first.')
    }

    return Map.groupBy(allTracks, (t) => t.stream_type)
  }

  protected async resolveOffset(fileIdA: number, fileIdB: number) {
    const [vadA, vadB] = await Promise.all([
      this.loadVad(fileIdA),
      this.loadVad(fileIdB),
    ])

    if (!vadA || !vadB) {
      Log.warn(
        `audio sync skipped: missing vad fileA=${!!vadA} fileB=${!!vadB}`
      )

      return { offset: 0, confidence: null as number | null }
    }

    const result = AudioCorrelator.correlateTimestamps(vadA, vadB)

    if (result.confidence < MIN_SYNC_CONFIDENCE) {
      Log.warn(
        `audio sync skipped: low confidence=${result.confidence.toFixed(1)} offset=${result.offsetSeconds.toFixed(3)}s`
      )

      return { offset: 0, confidence: result.confidence }
    }

    Log.info(
      `audio sync applied: offset=${result.offsetSeconds.toFixed(3)}s confidence=${result.confidence.toFixed(1)}`
    )

    return { offset: result.offsetSeconds, confidence: result.confidence }
  }

  protected async correlateSubtitle(vadFileId: number, srtPath: string) {
    const vad = await this.loadVad(vadFileId)

    if (!vad) {
      return { offset: 0, confidence: null as number | null }
    }

    const srtContent = await Bun.file(srtPath).text()
    const srtTimestamps = Parsers.srtTimestamps(srtContent)

    if (srtTimestamps.length === 0) {
      return { offset: 0, confidence: null as number | null }
    }

    const result = AudioCorrelator.correlateOnsets(vad, srtTimestamps)

    return { offset: result.offsetSeconds, confidence: result.confidence }
  }

  protected async resolveSubtitleOffset(vadFileId: number, srtPath: string) {
    const { offset, confidence } = await this.correlateSubtitle(
      vadFileId,
      srtPath
    )

    if (confidence === null) {
      Log.warn('subtitle sync skipped: missing vad or empty SRT')

      return { offset: 0, confidence }
    }

    if (confidence < MIN_SYNC_CONFIDENCE) {
      Log.warn(
        `subtitle sync skipped: low confidence=${confidence.toFixed(1)} offset=${offset.toFixed(3)}s`
      )

      return { offset: 0, confidence }
    }

    Log.info(
      `subtitle sync applied: offset=${offset.toFixed(3)}s confidence=${confidence.toFixed(1)}`
    )

    return { offset, confidence }
  }

  private async loadVad(fileId: number) {
    const vad = await DbMediaVad.getByMediaFileId(fileId)

    if (!vad) {
      return null
    }

    return new Float32Array(
      vad.data.buffer,
      vad.data.byteOffset,
      vad.data.byteLength / Float32Array.BYTES_PER_ELEMENT
    )
  }
}
