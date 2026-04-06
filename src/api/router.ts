import { configRouter } from '@/api/routers/config'
import { downloadsRouter } from '@/api/routers/downloads'
import { eventsRouter } from '@/api/routers/events'
import { libraryRouter } from '@/api/routers/library'
import { releasesRouter } from '@/api/routers/releases'
import { subtitlesRouter } from '@/api/routers/subtitles'
import { tmdbRouter } from '@/api/routers/tmdb'

export const router = {
  config: configRouter,
  downloads: downloadsRouter,
  events: eventsRouter,
  library: libraryRouter,
  releases: releasesRouter,
  tmdb: tmdbRouter,
  subtitles: subtitlesRouter,
}
