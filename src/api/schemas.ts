import { type } from 'arktype'

import { media_type } from '@/db/connection'

export const LibrarySchemas = {
  list: type({
    'media_type?': media_type,
  }),
}
