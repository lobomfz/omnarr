import { configRouter } from '@/api/routers/config'
import { downloadsRouter } from '@/api/routers/downloads'
import { eventsRouter } from '@/api/routers/events'
import { libraryRouter } from '@/api/routers/library'
import { playerRouter } from '@/api/routers/player'
import { releasesRouter } from '@/api/routers/releases'
import { subtitlesRouter } from '@/api/routers/subtitles'
import { tmdbRouter } from '@/api/routers/tmdb'

export const router = {
  config: configRouter,
  downloads: downloadsRouter,
  events: eventsRouter,
  library: libraryRouter,
  player: playerRouter,
  releases: releasesRouter,
  tmdb: tmdbRouter,
  subtitles: subtitlesRouter,
}
