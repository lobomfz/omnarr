import { os } from '@orpc/server'

import { EventsSchemas } from '@/api/schemas'
import { DbEvents } from '@/db/events'

export const eventsRouter = {
  getByMediaId: os
    .input(EventsSchemas.getByMediaId)
    .handler(({ input }) => DbEvents.getByMediaId(input.media_id)),

  markRead: os
    .input(EventsSchemas.markRead)
    .handler(({ input }) => DbEvents.markRead(input.ids)),
}
