import { type } from 'arktype'

import { envVariables } from '@/env'
import { indexerSchema } from '@/integrations/indexers/registry'
import { Log } from '@/log'

const qbittorrentClient = type({
  type: "'qbittorrent'",
  url: 'string',
  username: 'string',
  password: 'string',
  category: "string = 'omnarr'",
})

const configSchema = type({
  'root_folders?': type({
    'movie?': 'string',
    'tv?': 'string',
    'tracks?': 'string',
  }),
  indexers: indexerSchema.array().default(() => []),
  'download_client?': qbittorrentClient.or('null'),
  transcoding: type({
    video_crf: 'number.integer = 21',
    video_preset: type
      .enumerated(
        'ultrafast',
        'superfast',
        'veryfast',
        'faster',
        'fast',
        'medium',
        'slow',
        'slower',
        'veryslow',
        'placebo'
      )
      .default('veryfast'),
  }).default(() => ({})),
})

export type Config = typeof configSchema.infer
export type ConfigInput = typeof configSchema.inferIn
export const configJsonSchema = configSchema.toJsonSchema()
export const config = await getConfig().catch((err) => {
  Log.warn(
    `config load failed path="${envVariables.OMNARR_CONFIG_PATH}" error="${err.message}"`
  )
  return configSchema.assert({})
})

async function getConfig() {
  const json = await Bun.file(envVariables.OMNARR_CONFIG_PATH).json()

  return configSchema.assert(json)
}
