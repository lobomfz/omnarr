import { homedir } from 'os'
import { join } from 'path'

import { type } from '@lobomfz/db'

const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
const xdgDataHome = process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share')

const envSchema = type({
  OMNARR_DB_PATH: type('string').default(join(xdgDataHome, 'omnarr/db.sqlite')),
  OMNARR_LOG_PATH: type('string').default(
    join(xdgDataHome, 'omnarr/logs/omnarr.log')
  ),
  OMNARR_CONFIG_PATH: type('string').default(
    join(xdgConfigHome, 'omnarr/config.json')
  ),
  TMDB_API_KEY: type('string').default('a17968d48d23bbc9765e23cbb779597a'),
  TMDB_API_URL: type('string').default('https://api.themoviedb.org/3'),
  BEYOND_HD_API_URL: type('string').default(
    'https://beyond-hd.me/api/torrents'
  ),
  YTS_API_URL: type('string').default('https://movies-api.accel.li/api/v2/'),
  SUPERFLIX_API_URL: type('string').default('https://superflixapi.rest'),
  SUBDL_API_URL: type('string').default('https://api.subdl.com'),
  SUBDL_DOWNLOAD_URL: type('string').default('https://dl.subdl.com'),
})

export const envVariables = envSchema.assert({ ...process.env })
