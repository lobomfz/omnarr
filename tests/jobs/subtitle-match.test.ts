import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'

import '@/jobs/workers/subtitle-match'
import '@/jobs/workers/scan'
import { database, db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbEvents } from '@/db/events'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbMediaVad } from '@/db/media-vad'
import { DbTmdbMedia } from '@/db/tmdb-media'
import { Scheduler } from '@/jobs/scheduler'
import { config } from '@/lib/config'
import { deriveId } from '@/lib/utils'

import { SubdlMock } from '../mocks/subdl'

const tracksDir = config.root_folders!.tracks!
const MOVIE_ID = deriveId('603:movie')

beforeEach(async () => {
  database.reset()
  SubdlMock.reset()
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

afterAll(async () => {
  await rm(tracksDir, { recursive: true }).catch(() => {})
})

async function setupMovieWithVad() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 603,
    media_type: 'movie',
    title: 'The Matrix',
    year: 1999,
    imdb_id: 'tt0133093',
  })

  await DbMedia.create({
    id: MOVIE_ID,
    tmdb_media_id: tmdb.id,
    media_type: 'movie',
    root_folder: '/tmp/movies',
  })

  const download = await DbDownloads.create({
    media_id: MOVIE_ID,
    source_id: 'torrent:matrix-1080p',
    download_url: 'magnet:?xt=urn:btih:abc',
    source: 'torrent',
    status: 'completed',
  })

  await db
    .insertInto('releases')
    .values({
      id: deriveId('torrent:matrix-1080p'),
      tmdb_id: 603,
      media_type: 'movie',
      source_id: 'torrent:matrix-1080p',
      indexer_source: 'yts',
      name: 'The.Matrix.1999.1080p.BluRay-GROUP',
      size: 5000000,
      hdr: '',
      download_url: 'magnet:?xt=urn:btih:abc',
    })
    .execute()

  const mediaFile = await DbMediaFiles.create({
    media_id: MOVIE_ID,
    download_id: download.id,
    path: '/tmp/movies/The.Matrix.1999.mkv',
    size: 5000000,
    format_name: 'matroska',
    duration: 8100,
  })

  await DbMediaTracks.create({
    media_file_id: mediaFile.id,
    stream_index: 0,
    stream_type: 'video',
    codec_name: 'h264',
    is_default: true,
    width: 1920,
    height: 1080,
  })

  const vadTimestamps = Float32Array.from([5, 5.5, 500, 500.5])

  await DbMediaVad.create({
    media_file_id: mediaFile.id,
    data: Buffer.from(vadTimestamps.buffer),
  })

  return MOVIE_ID
}

describe('Scheduler.subtitleMatch', () => {
  test('enqueues to correct queue and job completes', async () => {
    const mediaId = await setupMovieWithVad()

    const job = Scheduler.subtitleMatch({
      media_id: mediaId,
    })

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(mediaId)

    expect(events.length).toBeGreaterThanOrEqual(1)
  })
})

describe('subtitle-match worker', () => {
  test('creates completed event on successful match', async () => {
    const mediaId = await setupMovieWithVad()

    await SubdlMock.db
      .insertInto('subtitles')
      .values({
        id: 100,
        release_name: 'The.Matrix.1999.1080p.BluRay-GROUP',
        name: 'SUBDL::good-sync',
        lang: 'english',
        language: 'EN',
        author: 'testuser',
        url: '/subtitle/good-sync.zip',
        imdb_id: 'tt0133093',
      })
      .execute()

    const job = Scheduler.subtitleMatch({
      media_id: mediaId,
    })

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(mediaId)
    const matchEvent = events.find(
      (e) => e.entity_type === 'subtitle' && e.event_type === 'completed'
    )

    expect(matchEvent).toBeDefined()
    expect(matchEvent!.message).toContain('matched')
  })

  test('creates completed event when no match found', async () => {
    const mediaId = await setupMovieWithVad()

    await SubdlMock.db
      .insertInto('subtitles')
      .values({
        id: 100,
        release_name: 'The.Matrix.1999.Sub.Bad',
        name: 'SUBDL::bad-sync',
        lang: 'english',
        language: 'EN',
        author: 'testuser',
        url: '/subtitle/bad-sync.zip',
        imdb_id: 'tt0133093',
      })
      .execute()

    const job = Scheduler.subtitleMatch({
      media_id: mediaId,
    })

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(mediaId)
    const noMatchEvent = events.find(
      (e) =>
        e.entity_type === 'subtitle' &&
        e.event_type === 'completed' &&
        e.message.includes('No subtitle')
    )

    expect(noMatchEvent).toBeDefined()
  })

  test('creates error event on exception', async () => {
    const tmdb = await DbTmdbMedia.upsert({
      tmdb_id: 99999,
      media_type: 'movie',
      title: 'No VAD Movie',
      year: 2020,
      imdb_id: 'tt9999999',
    })

    const noVadId = deriveId('99999:movie')

    await DbMedia.create({
      id: noVadId,
      tmdb_media_id: tmdb.id,
      media_type: 'movie',
      root_folder: '/tmp/movies',
    })

    const job = Scheduler.subtitleMatch({
      media_id: noVadId,
    })

    await job.waitUntilFinished()

    const events = await DbEvents.getByMediaId(noVadId)
    const errorEvent = events.find(
      (e) => e.entity_type === 'subtitle' && e.event_type === 'error'
    )

    expect(errorEvent).toBeDefined()
  })
})
