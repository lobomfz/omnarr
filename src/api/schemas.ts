import { type } from 'arktype'

import { media_type } from '@/db/connection'

export const LibrarySchemas = {
  list: type({
    'media_type?': media_type,
  }),
  getInfo: type({
    id: 'string',
    'season?': 'number.integer',
    'episode?': 'number.integer',
  }),
}

export const SearchSchemas = {
  search: type({
    query: 'string >= 3',
  }),
}

export const ReleasesSchemas = {
  search: type({
    tmdb_id: 'number.integer',
    media_type,
    'season_number?': 'number.integer',
  }),
}

export const DownloadSchemas = {
  list: type({
    limit: 'number.integer = 10',
  }),
  add: type({
    release_id: 'string',
    'media_id?': 'string',
    'audio_only?': 'boolean',
  }),
}

export const ScanSchemas = {
  rescan: type({
    media_id: 'string',
    'force?': 'boolean',
  }),
}

export const SubtitlesSchemas = {
  search: type({
    media_id: 'string',
    'season?': 'number.integer',
    'episode?': 'number.integer',
    'lang?': 'string',
  }),
  download: type({
    release_id: 'string',
    media_id: 'string',
  }),
  autoMatch: type({
    media_id: 'string',
    'season?': 'number.integer',
    'episode?': 'number.integer',
    'lang?': 'string',
  }),
}

export const EventsSchemas = {
  getByMediaId: type({
    media_id: 'string',
  }),
  markRead: type({
    ids: 'number.integer[] >= 1',
  }),
}
