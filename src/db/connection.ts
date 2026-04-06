import { mkdirSync } from 'fs'
import { dirname } from 'path'

import { Database, type, generated } from '@lobomfz/db'

import { envVariables } from '@/lib/env'
import { Log } from '@/lib/log'

mkdirSync(dirname(envVariables.OMNARR_DB_PATH), { recursive: true })

export const media_type = type.enumerated('movie', 'tv')
const stream_type = type.enumerated('video', 'audio', 'subtitle')
const download_status = type.enumerated(
  'pending',
  'downloading',
  'processing',
  'seeding',
  'paused',
  'completed',
  'error'
)
const download_source = type.enumerated('torrent', 'ripper', 'subtitle')
const indexer_source = type.enumerated('beyond-hd', 'yts', 'superflix', 'subdl')
const event_entity_type = type.enumerated(
  'download',
  'scan',
  'media',
  'indexer',
  'sync',
  'subtitle'
)
const event_type = type.enumerated(
  'created',
  'completed',
  'error',
  'file_error',
  'indexer_error',
  'recovered'
)

export const database = new Database({
  path: envVariables.OMNARR_DB_PATH,
  schema: {
    tables: {
      tmdb_media: type({
        id: generated('autoincrement'),
        tmdb_id: 'number',
        media_type,
        title: 'string',
        'year?': 'number.integer',
        'overview?': 'string',
        'poster_path?': 'string',
        imdb_id: 'string',
        fetched_at: generated('now'),
      }),

      seasons: type({
        id: generated('autoincrement'),
        tmdb_media_id: type('number.integer').configure({
          references: 'tmdb_media.id',
          onDelete: 'cascade',
        }),
        season_number: 'number.integer',
        'title?': 'string',
        'episode_count?': 'number.integer',
        updated_at: generated('now'),
      }),

      episodes: type({
        id: generated('autoincrement'),
        season_id: type('number.integer').configure({
          references: 'seasons.id',
          onDelete: 'cascade',
        }),
        episode_number: 'number.integer',
        'title?': 'string',
      }),

      media: type({
        id: type('string').configure({ primaryKey: true }),
        tmdb_media_id: type('number.integer').configure({
          references: 'tmdb_media.id',
        }),
        media_type,
        root_folder: 'string',
        added_at: generated('now'),
      }),

      search_results: type({
        id: 'string',
        tmdb_id: 'number',
        media_type,
        title: 'string',
        'year?': 'number.integer',
        searched_at: generated('now'),
      }),

      releases: type({
        id: 'string',
        tmdb_id: 'number',
        media_type,
        source_id: 'string',
        indexer_source,
        name: 'string',
        size: 'number',
        seeders: type('number').default(0),
        'imdb_id?': 'string',
        'resolution?': 'string',
        'codec?': 'string',
        hdr: 'string',
        download_url: 'string',
        'language?': 'string',
        'season_number?': 'number.integer',
        'episode_number?': 'number.integer',
        searched_at: generated('now'),
      }),

      downloads: type({
        id: generated('autoincrement'),
        media_id: type('string').configure({
          references: 'media.id',
          onDelete: 'cascade',
        }),
        source_id: 'string',
        download_url: 'string',
        progress: type('number').default(0),
        speed: type('number').default(0),
        eta: type('number.integer').default(0),
        source: download_source.default('torrent'),
        status: download_status.default('downloading'),
        content_path: 'string | null',
        error_at: 'string | null',
        'season_number?': 'number.integer',
        'episode_number?': 'number.integer',
        started_at: generated('now'),
      }),

      media_files: type({
        id: generated('autoincrement'),
        media_id: type('string').configure({
          references: 'media.id',
          onDelete: 'cascade',
        }),
        download_id: type('number.integer').configure({
          references: 'downloads.id',
          onDelete: 'restrict',
        }),
        'episode_id?': type('number.integer').configure({
          references: 'episodes.id',
          onDelete: 'set null',
        }),
        path: 'string',
        size: 'number',
        'format_name?': 'string',
        'duration?': 'number',
        scanned_at: generated('now'),
      }),

      media_vad: type({
        id: generated('autoincrement'),
        media_file_id: type('number.integer').configure({
          references: 'media_files.id',
          onDelete: 'cascade',
          unique: true,
        }),
        data: type.instanceOf(Uint8Array),
      }),

      media_keyframes: type({
        id: generated('autoincrement'),
        media_file_id: type('number.integer').configure({
          references: 'media_files.id',
          onDelete: 'cascade',
        }),
        stream_index: 'number.integer',
        pts_time: 'number',
        duration: 'number',
      }),

      events: type({
        id: generated('autoincrement'),
        'media_id?': type('string').configure({
          references: 'media.id',
          onDelete: 'cascade',
        }),
        entity_type: event_entity_type,
        entity_id: 'string',
        event_type,
        message: 'string',
        'metadata?': 'string',
        read: type('boolean').default(false),
        created_at: generated('now'),
      }),

      media_tracks: type({
        id: generated('autoincrement'),
        media_file_id: type('number.integer').configure({
          references: 'media_files.id',
          onDelete: 'cascade',
        }),
        stream_index: 'number.integer',
        stream_type: stream_type,
        codec_name: 'string',
        'language?': 'string',
        'title?': 'string',
        is_default: 'boolean',
        'width?': 'number.integer',
        'height?': 'number.integer',
        'framerate?': 'number',
        'bit_rate?': 'number',
        'channels?': 'number.integer',
        'channel_layout?': 'string',
        'sample_rate?': 'number.integer',
      }),
    },
    indexes: {
      tmdb_media: [
        {
          columns: ['tmdb_id', 'media_type'],
          unique: true,
        },
      ],
      seasons: [
        {
          columns: ['tmdb_media_id', 'season_number'],
          unique: true,
        },
      ],
      episodes: [
        {
          columns: ['season_id', 'episode_number'],
          unique: true,
        },
      ],
      media: [
        {
          columns: ['tmdb_media_id'],
          unique: true,
        },
      ],
      search_results: [
        {
          columns: ['tmdb_id', 'media_type'],
          unique: true,
        },
      ],
      releases: [
        {
          columns: ['source_id'],
          unique: true,
        },
      ],
      downloads: [
        {
          columns: ['source_id', 'season_number', 'episode_number'],
          unique: true,
        },
      ],
      events: [
        { columns: ['media_id'] },
        { columns: ['entity_type', 'entity_id'] },
        { columns: ['read'] },
      ],
    },
  },
  pragmas: {
    journal_mode: 'wal',
    synchronous: 'normal',
  },
})

Log.info(`database initialized path=${envVariables.OMNARR_DB_PATH}`)

export type DB = typeof database.infer
export const db = database.kysely
export type media_type = typeof media_type.infer
export type download_status = typeof download_status.infer
export type download_source = typeof download_source.infer
export type indexer_source = typeof indexer_source.infer

export interface AliasedDb extends DB {
  mf: DB['media_files']
}
