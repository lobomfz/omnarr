import { useSuspenseQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'

import { Formatters } from '@/lib/formatters'
import { orpc } from '@/web/client'
import { Tooltip } from '@/web/components/ui/tooltip'
import type { MediaInfo } from '@/web/types/library'

import { useScanProgress } from '../../-utils/use-scan-progress'
import { DownloadGroup } from './download-group'
import { ScanProgress } from './scan-progress'

function useMediaEvents(mediaId: string) {
  return useSuspenseQuery(
    orpc.events.getByMediaId.queryOptions({
      input: { media_id: mediaId },
    })
  )
}

export function DownloadsSection(props: {
  media: MediaInfo
  seasonNumber?: number
}) {
  const scanProgress = useScanProgress(props.media.id)
  const { data: events } = useMediaEvents(props.media.id)

  const scanErrors = events.filter(
    (e) => e.entity_type === 'scan' && e.event_type === 'file_error'
  )

  const downloads =
    props.seasonNumber == null
      ? props.media.downloads
      : props.media.downloads.filter(
          (d) => d.season_number === props.seasonNumber
        )

  return (
    <div>
      {scanProgress && <ScanProgress progress={scanProgress} />}

      {scanErrors.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {scanErrors.map((e) => (
            <div
              key={e.id}
              className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs"
            >
              <AlertTriangle className="size-3.5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-destructive font-medium">
                  Scan failed
                </span>
                <Tooltip content={e.entity_id}>
                  <span className="text-muted-foreground ml-1.5 truncate">
                    {e.entity_id.split('/').at(-1)}
                  </span>
                </Tooltip>
                <p className="text-muted-foreground mt-0.5">{e.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {downloads.length ? (
        <div className="space-y-2">
          {downloads.map((d) => (
            <DownloadGroup
              key={d.id}
              download={d}
              episodeLabel={
                d.episode_number == null
                  ? undefined
                  : Formatters.episodeLabel(d.episode_number)
              }
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-12">
          No downloads yet.
        </p>
      )}
    </div>
  )
}
