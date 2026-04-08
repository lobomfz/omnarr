import type { RouterOutputs } from '@/web/client'

export type MediaItem = RouterOutputs['library']['list'][number]
export type MediaInfo = NonNullable<RouterOutputs['library']['getInfo']>
export type DownloadItem = MediaInfo['downloads'][number]
