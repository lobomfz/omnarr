import { db } from '@/db/connection'

const result = await db.deleteFrom('media_files').executeTakeFirst()

console.log(
  `Deleted ${result.numDeletedRows} media files (tracks, keyframes, VAD cascaded)`
)
