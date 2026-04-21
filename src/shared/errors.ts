import { ORPCError } from '@orpc/server'

export const ERROR_MAP = {
  RELEASE_NOT_FOUND: { message: 'Release not found', status: 404 },
  MEDIA_NOT_FOUND: { message: 'Media not found', status: 404 },
  SEARCH_RESULT_NOT_FOUND: { message: 'Search result not found', status: 404 },
  EPISODE_NOT_FOUND: { message: 'Episode not found', status: 404 },
  DUPLICATE_DOWNLOAD: {
    message: 'This release is already being downloaded',
    status: 409,
  },
  NO_DOWNLOAD_CLIENT: { message: 'No download client configured', status: 422 },
  NO_INDEXERS: { message: 'No indexers configured', status: 422 },
  NO_SUBTITLE_INDEXER: {
    message: 'No subtitle indexer configured',
    status: 422,
  },
  NO_ROOT_FOLDER: { message: 'No root folder configured', status: 422 },
  TORRENT_REJECTED: {
    message: 'Torrent rejected by download client',
    status: 422,
  },
  TORRENT_NOT_READY: {
    message: 'Torrent was accepted but not registered in time',
    status: 422,
  },
  DOWNLOAD_CLIENT_UNREACHABLE: {
    message: 'Download client is unreachable',
    status: 502,
  },
  TV_REQUIRES_SEASON: {
    message: 'TV shows require a season number',
    status: 422,
  },
  TV_REQUIRES_SEASON_EPISODE: {
    message: 'TV shows require season and episode numbers',
    status: 422,
  },
  NO_SRT_IN_ARCHIVE: {
    message: 'No .srt file found in subtitle archive',
    status: 404,
  },
  NO_SRT_EPISODE_PATTERN: {
    message: 'No .srt files with episode patterns found in archive',
    status: 404,
  },
  NO_IMDB_ID: { message: 'No IMDB ID found', status: 422 },
  NO_EPISODES: { message: 'No episodes found for this season', status: 404 },
  NO_TRACKS: { message: 'No scanned tracks available', status: 422 },
  TRACK_NOT_FOUND: { message: 'Track not found', status: 404 },
  TRACK_EPISODE_MISMATCH: {
    message: 'All tracks must belong to the same episode',
    status: 422,
  },
  NO_KEYFRAMES: { message: 'Keyframes not found, scan required', status: 422 },
  TMDB_UNAVAILABLE: { message: 'Could not reach TMDB', status: 502 },
} as const

export function errors<T extends keyof typeof ERROR_MAP>(codes: T[]) {
  return Object.fromEntries(codes.map((code) => [code, ERROR_MAP[code]])) as {
    [K in T]: (typeof ERROR_MAP)[K]
  }
}

export class OmnarrError extends ORPCError<keyof typeof ERROR_MAP, undefined> {
  constructor(code: keyof typeof ERROR_MAP, opts?: { cause?: unknown }) {
    super(code, { status: ERROR_MAP[code].status, cause: opts?.cause })
  }
}
