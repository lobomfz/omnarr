import type { RouterOutputs } from '@/web/client'

export type ReleasesResult = RouterOutputs['releases']['search']
export type Release = ReleasesResult['releases'][number]
