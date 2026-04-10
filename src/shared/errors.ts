import { ORPCError } from '@orpc/server'

export const ERROR_MAP = {
  RELEASE_NOT_FOUND: 'Release not found',
  MEDIA_NOT_FOUND: 'Media not found',
  SEARCH_RESULT_NOT_FOUND: 'Search result not found',
  EPISODE_NOT_FOUND: 'Episode not found',
  DUPLICATE_DOWNLOAD: 'This release is already being downloaded',
  NO_DOWNLOAD_CLIENT: 'No download client configured',
  NO_INDEXERS: 'No indexers configured',
  NO_SUBTITLE_INDEXER: 'No subtitle indexer configured',
  NO_ROOT_FOLDER: 'No root folder configured',
  TORRENT_REJECTED: 'Torrent rejected by download client',
  TORRENT_NOT_READY: 'Torrent was accepted but not registered in time',
  DOWNLOAD_CLIENT_UNREACHABLE: 'Download client is unreachable',
  TV_REQUIRES_SEASON: 'TV shows require a season number',
  TV_REQUIRES_SEASON_EPISODE: 'TV shows require season and episode numbers',
  NO_SRT_IN_ARCHIVE: 'No .srt file found in subtitle archive',
  NO_SRT_EPISODE_PATTERN:
    'No .srt files with episode patterns found in archive',
  NO_IMDB_ID: 'No IMDB ID found',
  NO_EPISODES: 'No episodes found for this season',
  TMDB_UNAVAILABLE: 'Could not reach TMDB',
} as const

export class OmnarrError extends ORPCError<keyof typeof ERROR_MAP, undefined> {}
