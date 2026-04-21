import { PubSub } from '@/api/pubsub'
import { type scan_progress_step } from '@/db/connection'
import { DbMediaTracks } from '@/db/media-tracks'

export const ScanProgress = {
  async publishTrack(data: {
    media_id: string
    path: string
    current_step: scan_progress_step
    track_id: number
    media_file_id: number
    ratio: number
  }) {
    await DbMediaTracks.updateScanRatio(data.track_id, data.ratio)

    const aggregate = await DbMediaTracks.aggregateScanRatioByFile(
      data.media_file_id
    )

    await PubSub.publish('scan_file_progress', {
      media_id: data.media_id,
      path: data.path,
      current_step: data.current_step,
      ratio: aggregate,
    })
  },
}
