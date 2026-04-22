import type { RouterOutputs } from '@/web/client'

export type MediaItem = RouterOutputs['library']['list'][number]
export type MediaInfo = RouterOutputs['library']['getInfo']
