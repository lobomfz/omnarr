import type { Insertable } from '@lobomfz/db'

import { Releases } from '@/core/releases'
import { type DB, database, type download_status } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaKeyframes } from '@/db/media-keyframes'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'
import { DbReleases } from '@/db/releases'
import { DbSearchResults } from '@/db/search-results'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { TmdbClient } from '@/integrations/tmdb/client'
import { ripperQueue, scanQueue, subtitleMatchQueue } from '@/jobs/queues'
import { deriveId } from '@/lib/utils'

import { QBittorrentMock } from '../mocks/qbittorrent'

export const TestSeed = {
  library: {
    async movie(opts: {
      tmdbId: number
      title: string
      year: number
      imdbId: string
      rootFolder?: string
      posterPath?: string
      backdropPath?: string
      overview?: string
    }) {
      const tmdb = await DbTmdbMedia.upsert({
        tmdb_id: opts.tmdbId,
        media_type: 'movie',
        title: opts.title,
        year: opts.year,
        imdb_id: opts.imdbId,
        poster_path: opts.posterPath,
        backdrop_path: opts.backdropPath,
        overview: opts.overview,
      })

      return await DbMedia.create({
        id: deriveId(`${opts.tmdbId}:movie`),
        tmdb_media_id: tmdb.id,
        media_type: 'movie',
        root_folder: opts.rootFolder ?? '/tmp/omnarr-test-movies',
      })
    },

    async matrix(opts?: {
      rootFolder?: string
      posterPath?: string
      backdropPath?: string
      overview?: string
    }) {
      return await TestSeed.library.movie({
        tmdbId: 603,
        title: 'The Matrix',
        year: 1999,
        imdbId: 'tt0133093',
        rootFolder: opts?.rootFolder,
        posterPath: opts?.posterPath,
        backdropPath: opts?.backdropPath,
        overview: opts?.overview,
      })
    },

    async tv(opts: {
      tmdbId: number
      title: string
      year: number
      imdbId: string
      rootFolder?: string
      posterPath?: string
      backdropPath?: string
      overview?: string
      seasons: {
        seasonNumber: number
        title: string
        episodeCount: number
        episodes?: { episodeNumber: number; title: string }[]
      }[]
    }) {
      const tmdb = await DbTmdbMedia.upsert({
        tmdb_id: opts.tmdbId,
        media_type: 'tv',
        title: opts.title,
        year: opts.year,
        imdb_id: opts.imdbId,
        poster_path: opts.posterPath,
        backdrop_path: opts.backdropPath,
        overview: opts.overview,
      })

      const media = await DbMedia.create({
        id: deriveId(`${opts.tmdbId}:tv`),
        tmdb_media_id: tmdb.id,
        media_type: 'tv',
        root_folder: opts.rootFolder ?? '/tmp/omnarr-test-tv',
      })

      const allEpisodes: Awaited<ReturnType<typeof DbEpisodes.upsert>> = []

      for (const season of opts.seasons) {
        const [s] = await DbSeasons.upsert([
          {
            tmdb_media_id: tmdb.id,
            season_number: season.seasonNumber,
            title: season.title,
            episode_count: season.episodeCount,
          },
        ])

        if (season.episodes) {
          const eps = await DbEpisodes.upsert(
            season.episodes.map((ep) => ({
              season_id: s.id,
              episode_number: ep.episodeNumber,
              title: ep.title,
            }))
          )

          allEpisodes.push(...eps)
        }
      }

      return { media, episodes: allEpisodes }
    },

    async breakingBad(opts?: { withEpisodes?: boolean }) {
      const withEpisodes = opts?.withEpisodes ?? true

      const episodes = withEpisodes
        ? [
            { episodeNumber: 1, title: 'Pilot' },
            { episodeNumber: 2, title: "Cat's in the Bag..." },
            { episodeNumber: 3, title: "...And the Bag's in the River" },
          ]
        : undefined

      const result = await TestSeed.library.tv({
        tmdbId: 1399,
        title: 'Breaking Bad',
        year: 2008,
        imdbId: 'tt0903747',
        seasons: [
          {
            seasonNumber: 1,
            title: 'Season 1',
            episodeCount: 3,
            episodes,
          },
        ],
      })

      return result.media
    },
  },

  search: {
    async result(tmdbId: number, mediaType: 'movie' | 'tv', title?: string) {
      const [row] = await DbSearchResults.upsert([
        { tmdb_id: tmdbId, media_type: mediaType, title: title ?? 'seed' },
      ])

      return row.id
    },

    async matrix() {
      return await TestSeed.search.result(603, 'movie', 'The Matrix')
    },

    async breakingBad() {
      return await TestSeed.search.result(1399, 'tv', 'Breaking Bad')
    },
  },

  releases: {
    async matrix() {
      const results = await new TmdbClient().search('Matrix')

      return await new Releases().search(
        results[0].tmdb_id,
        results[0].media_type
      )
    },

    async breakingBad() {
      const results = await new TmdbClient().search('Breaking Bad')

      return await new Releases().search(
        results[0].tmdb_id,
        results[0].media_type,
        { season: 1 }
      )
    },
  },

  downloads: {
    async torrent(opts: {
      mediaId: string
      sourceId: string
      downloadUrl?: string
      progress?: number
      status?: download_status
      seasonNumber?: number
      episodeNumber?: number
    }) {
      const downloadUrl =
        opts.downloadUrl ??
        `https://beyond-hd.me/dl/${opts.sourceId.toLowerCase()}`
      const hash = opts.sourceId.toLowerCase()

      const download = await DbDownloads.create({
        media_id: opts.mediaId,
        source_id: opts.sourceId,
        download_url: downloadUrl,
        source: 'torrent',
        status: opts.status ?? 'downloading',
        progress: opts.progress ?? 0,
        season_number: opts.seasonNumber,
        episode_number: opts.episodeNumber,
      })

      await QBittorrentMock.db
        .insertInto('torrents')
        .values({
          hash,
          url: downloadUrl,
          savepath: '',
          category: 'omnarr',
          progress: opts.progress ?? 0,
          dlspeed: 0,
          eta: 0,
          state: 'downloading',
          content_path: `/${hash}`,
        })
        .execute()

      return download
    },

    async ripper(opts: {
      mediaId: string
      sourceId: string
      progress?: number
      status?: download_status
      speed?: number
      seasonNumber?: number
      episodeNumber?: number
    }) {
      return await DbDownloads.create({
        media_id: opts.mediaId,
        source_id: opts.sourceId,
        download_url: `imdb:${opts.sourceId}`,
        source: 'ripper',
        status: opts.status ?? 'pending',
        progress: opts.progress ?? 0,
        speed: opts.speed ?? 0,
        season_number: opts.seasonNumber,
        episode_number: opts.episodeNumber,
      })
    },

    async completed(
      mediaId: string,
      opts?: { sourceId?: string; contentPath?: string }
    ) {
      const sourceId = opts?.sourceId ?? 'test_hash'

      return await DbDownloads.create({
        media_id: mediaId,
        source_id: sourceId,
        download_url: `magnet:${sourceId}`,
        status: 'completed',
        content_path: opts?.contentPath,
      })
    },

    async completedWithFile(
      mediaId: string,
      opts?: { sourceId?: string; contentPath?: string; filePath?: string }
    ) {
      const sourceId = opts?.sourceId ?? 'test_hash'
      const contentPath = opts?.contentPath ?? '/movies/The Matrix (1999)'

      const download = await DbDownloads.create({
        media_id: mediaId,
        source_id: sourceId,
        download_url: `magnet:${sourceId}`,
        status: 'completed',
        content_path: contentPath,
      })

      const file = await DbMediaFiles.create({
        media_id: mediaId,
        download_id: download.id,
        path: opts?.filePath ?? '/movies/The Matrix (1999)/The.Matrix.1999.mkv',
        size: 8_000_000_000,
      })

      return { download, file }
    },
  },

  player: {
    async downloadWithTracks(
      mediaId: string,
      sourceId: string,
      filePath: string,
      tracks: Omit<Insertable<DB['media_tracks']>, 'media_file_id'>[],
      opts?: {
        duration?: number
        keyframes?: number[]
        episode_id?: number
      }
    ) {
      const download = await DbDownloads.create({
        media_id: mediaId,
        source_id: sourceId,
        download_url: `magnet:${sourceId}`,
        status: 'completed',
        content_path: '/movies/The Matrix (1999)',
      })

      const file = await DbMediaFiles.create({
        media_id: mediaId,
        download_id: download.id,
        path: filePath,
        size: 8_000_000_000,
        duration: opts?.duration,
        episode_id: opts?.episode_id,
      })

      const createdTracks = await DbMediaTracks.createMany(
        tracks.map((t) => ({ media_file_id: file.id, ...t }))
      )

      if (opts?.keyframes && opts.keyframes.length > 0) {
        const fileDuration = opts.duration ?? 0
        const videoTrack = createdTracks.find(
          (track) => track.stream_type === 'video'
        )

        if (videoTrack) {
          await DbMediaKeyframes.createBatch(
            opts.keyframes.map((pts_time, i) => ({
              track_id: videoTrack.id,
              pts_time,
              duration: (opts.keyframes![i + 1] ?? fileDuration) - pts_time,
            }))
          )
        }
      }

      return { download, file }
    },

    async movieWithTracks() {
      const media = await TestSeed.library.matrix()

      const { file } = await TestSeed.player.downloadWithTracks(
        media.id,
        'matrix-1080p',
        '/movies/The.Matrix.1999.mkv',
        [
          {
            stream_index: 0,
            stream_type: 'video',
            codec_name: 'h264',
            is_default: true,
            width: 1920,
            height: 1080,
          },
          {
            stream_index: 1,
            stream_type: 'audio',
            codec_name: 'aac',
            is_default: true,
            channels: 6,
            channel_layout: '5.1',
          },
        ],
        { keyframes: [0, 10, 20], duration: 30 }
      )

      const tracks = await DbMediaTracks.getByMediaFileId(file.id)

      return {
        media,
        file,
        video: tracks.find((t) => t.stream_type === 'video')!,
        audio: tracks.find((t) => t.stream_type === 'audio')!,
      }
    },

    async getTrackIds(fileId: number) {
      const tracks = await DbMediaTracks.getByMediaFileId(fileId)

      return {
        video: tracks.find((t) => t.stream_type === 'video')!,
        audio: tracks.find((t) => t.stream_type === 'audio')!,
        subtitle: tracks.find((t) => t.stream_type === 'subtitle'),
      }
    },

    async vadTrack(trackId: number, seed: number) {
      const segments = 10
      const timestamps = new Float32Array(segments * 2)
      let state = seed

      for (let i = 0; i < segments; i++) {
        state = (state * 1664525 + 1013904223) & 0xffffffff
        const start = i * 10 + ((state >>> 16) / 65536) * 2
        timestamps[i * 2] = start
        timestamps[i * 2 + 1] = start + 2 + ((state >>> 16) / 65536) * 3
      }

      await DbMediaVad.create({
        track_id: trackId,
        data: new Uint8Array(timestamps.buffer),
      })
    },

    async vad(fileId: number, seed: number) {
      const tracks = await DbMediaTracks.getByMediaFileId(fileId)
      const audioTrack = tracks.find((t) => t.stream_type === 'audio')

      if (!audioTrack) {
        throw new Error(`No audio track found for file ${fileId}`)
      }

      await TestSeed.player.vadTrack(audioTrack.id, seed)
    },
  },

  subtitleMatch: {
    async movieWithVad() {
      const media = await TestSeed.library.matrix()

      const { file } = await TestSeed.player.downloadWithTracks(
        media.id,
        'torrent:matrix-1080p',
        '/tmp/movies/The.Matrix.1999.mkv',
        [
          {
            stream_index: 0,
            stream_type: 'video',
            codec_name: 'h264',
            is_default: true,
            width: 1920,
            height: 1080,
          },
          {
            stream_index: 1,
            stream_type: 'audio',
            codec_name: 'aac',
            is_default: true,
          },
        ],
        { duration: 8100 }
      )

      await DbReleases.upsert(603, 'movie', [
        {
          source_id: 'torrent:matrix-1080p',
          indexer_source: 'yts',
          name: 'The.Matrix.1999.1080p.BluRay-GROUP',
          size: 5000000,
          imdb_id: 'tt0133093',
          resolution: '1080p',
          codec: 'x264',
          hdr: [],
          download_url: 'magnet:?xt=urn:btih:abc',
        },
      ])

      const vadTimestamps = Float32Array.from([5, 5.5, 500, 500.5])
      const tracks = await DbMediaTracks.getByMediaFileId(file.id)
      const audioTrack = tracks.find((track) => track.stream_type === 'audio')!

      await DbMediaVad.create({
        track_id: audioTrack.id,
        data: Buffer.from(vadTimestamps.buffer),
      })

      return media.id
    },
  },

  reset() {
    database.reset()
    QBittorrentMock.reset()
    scanQueue.clear()
    ripperQueue.clear()
    subtitleMatchQueue.clear()
  },
}
