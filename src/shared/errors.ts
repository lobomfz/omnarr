export const ERROR_MAP = {
  DOWNLOAD_CLIENT_UNREACHABLE: {
    message: 'Download client is unreachable',
    status: 502,
  },
  TORRENT_REJECTED: {
    message: 'Torrent rejected by download client',
    status: 422,
  },
  TMDB_UNAVAILABLE: { message: 'Could not reach TMDB', status: 502 },
  NO_IMDB_ID: { message: 'No IMDB ID found', status: 422 },
} as const

export class OmnarrError extends Error {
  readonly code: keyof typeof ERROR_MAP
  readonly status: number

  constructor(code: keyof typeof ERROR_MAP, opts?: { cause?: unknown }) {
    super(ERROR_MAP[code].message, { cause: opts?.cause })
    this.code = code
    this.status = ERROR_MAP[code].status
  }
}
