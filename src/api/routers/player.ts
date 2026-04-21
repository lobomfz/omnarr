import { os } from '@orpc/server'

import { PlayerSchemas } from '@/api/schemas'
import { playerSession } from '@/player/player-session'
import { errors } from '@/shared/errors'

export const playerRouter = {
  start: os
    .input(PlayerSchemas.start)
    .errors(
      errors([
        'TRACK_NOT_FOUND',
        'TRACK_EPISODE_MISMATCH',
        'NO_TRACKS',
        'NO_KEYFRAMES',
      ])
    )
    .handler(({ input }) => playerSession.start(input)),

  stop: os.handler(() => playerSession.stop()),
}
