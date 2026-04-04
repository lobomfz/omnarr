import { downloadsRouter } from '@/api/routers/downloads'
import { eventsRouter } from '@/api/routers/events'
import { libraryRouter } from '@/api/routers/library'
import { releasesRouter } from '@/api/routers/releases'
import { searchRouter } from '@/api/routers/search'
import { subtitlesRouter } from '@/api/routers/subtitles'

export const router = {
  downloads: downloadsRouter,
  events: eventsRouter,
  library: libraryRouter,
  releases: releasesRouter,
  search: searchRouter,
  subtitles: subtitlesRouter,
}
