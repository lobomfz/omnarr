import { mkdirSync } from 'fs'
import { dirname } from 'path'

import { Database, type, generated } from '@lobomfz/db'

import { envVariables } from '@/env'

mkdirSync(dirname(envVariables.OMNARR_DB_PATH), { recursive: true })

const media_type = type.enumerated('movie', 'tv')
const download_status = type.enumerated(
  'downloading',
  'seeding',
  'paused',
  'completed',
  'error'
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
        fetched_at: generated('now'),
      }),

      media: type({
        id: generated('autoincrement'),
        tmdb_media_id: type('number.integer').configure({
          references: 'tmdb_media.id',
        }),
        media_type,
        root_folder: 'string',
        has_file: type('boolean').default(false),
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
        info_hash: 'string',
        name: 'string',
        size: 'number',
        seeders: 'number',
        'imdb_id?': 'string',
        'resolution?': 'string',
        'codec?': 'string',
        hdr: 'string',
        download_url: 'string',
        searched_at: generated('now'),
      }),

      downloads: type({
        id: generated('autoincrement'),
        media_id: type('number.integer').configure({
          references: 'media.id',
          onDelete: 'cascade',
        }),
        info_hash: 'string',
        download_url: 'string',
        progress: type('number').default(0),
        speed: type('number').default(0),
        eta: type('number.integer').default(0),
        status: download_status.default('downloading'),
        error_at: 'string | null',
        started_at: generated('now'),
      }),
    },
    indexes: {
      tmdb_media: [
        {
          columns: ['tmdb_id', 'media_type'],
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
          columns: ['info_hash'],
          unique: true,
        },
      ],
    },
  },
  pragmas: {
    journal_mode: 'wal',
    synchronous: 'normal',
  },
})

export type DB = typeof database.infer
export const db = database.kysely
export type media_type = typeof media_type.infer
export type download_status = typeof download_status.infer
