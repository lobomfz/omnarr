import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/tmdb'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { DbMediaTracks } from '@/db/media-tracks'

import { TestSeed } from '../../../helpers/seed'
import { get, query, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, waitFor } from '../../testing-library'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(() => cleanup())

async function seedMovieWithTracks() {
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
        language: 'eng',
      },
      {
        stream_index: 2,
        stream_type: 'subtitle',
        codec_name: 'srt',
        is_default: false,
        language: 'eng',
      },
    ],
    { keyframes: [0, 10, 20], duration: 30 }
  )

  const tracks = await DbMediaTracks.getByMediaFileId(file.id)

  return {
    media,
    tracks: {
      video: tracks.find((t) => t.stream_type === 'video')!,
      audio: tracks.find((t) => t.stream_type === 'audio')!,
      subtitle: tracks.find((t) => t.stream_type === 'subtitle')!,
    },
  }
}

describe('hero track chips', () => {
  test('renders audio and subtitle chips when tracks are present', async () => {
    const { media } = await seedMovieWithTracks()

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('hero-track-chip', { 'stream-type': 'audio' })
        get('hero-track-chip', { 'stream-type': 'subtitle' })
      },
      { timeout: 5000 }
    )
  })

  test('hides video chip when only one video track exists', async () => {
    const { media } = await seedMovieWithTracks()

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('hero-track-chip', { 'stream-type': 'audio' })
      },
      { timeout: 5000 }
    )

    expect(query('hero-track-chip', { 'stream-type': 'video' })).toBeNull()
  })

  test('shows video chip when multiple video tracks exist', async () => {
    const media = await TestSeed.library.matrix()

    await TestSeed.player.downloadWithTracks(
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
          stream_type: 'video',
          codec_name: 'hevc',
          is_default: false,
          width: 3840,
          height: 2160,
        },
      ],
      { keyframes: [0, 10, 20], duration: 30 }
    )

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('hero-track-chip', { 'stream-type': 'video' })
      },
      { timeout: 5000 }
    )
  })

  test('pre-selects audio via is_default flag', async () => {
    const { media, tracks } = await seedMovieWithTracks()

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        expect(
          get('hero-track-chip', { 'stream-type': 'audio' }).dataset
            .selectedTrackId
        ).toBe(String(tracks.audio.id))
      },
      { timeout: 5000 }
    )
  })

  test('subtitle not pre-selected when is_default is false', async () => {
    const { media } = await seedMovieWithTracks()

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        expect(
          get('hero-track-chip', { 'stream-type': 'subtitle' }).dataset
            .selectedTrackId
        ).toBeUndefined()
      },
      { timeout: 5000 }
    )
  })

  test('user can change audio track selection', async () => {
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
          language: 'eng',
        },
        {
          stream_index: 2,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: false,
          channels: 2,
          channel_layout: 'stereo',
          language: 'por',
        },
      ],
      { keyframes: [0, 10, 20], duration: 30 }
    )

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const eng = tracks.find(
      (t) => t.stream_type === 'audio' && t.language === 'eng'
    )!
    const por = tracks.find(
      (t) => t.stream_type === 'audio' && t.language === 'por'
    )!

    const { user } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        expect(
          get('hero-track-chip', { 'stream-type': 'audio' }).dataset
            .selectedTrackId
        ).toBe(String(eng.id))
      },
      { timeout: 5000 }
    )

    await user.click(get('hero-track-chip', { 'stream-type': 'audio' }))

    await waitFor(() => {
      get('track-option', { 'track-id': String(por.id) })
    })

    await user.click(get('track-option', { 'track-id': String(por.id) }))

    await waitFor(() => {
      expect(
        get('hero-track-chip', { 'stream-type': 'audio' }).dataset
          .selectedTrackId
      ).toBe(String(por.id))
    })
  })

  test('subtitle enables via popover option', async () => {
    const { media, tracks } = await seedMovieWithTracks()

    const { user } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        expect(
          get('hero-track-chip', { 'stream-type': 'subtitle' }).dataset
            .selectedTrackId
        ).toBeUndefined()
      },
      { timeout: 5000 }
    )

    await user.click(get('hero-track-chip', { 'stream-type': 'subtitle' }))

    await waitFor(() => {
      get('track-option', { 'track-id': String(tracks.subtitle.id) })
    })

    await user.click(
      get('track-option', { 'track-id': String(tracks.subtitle.id) })
    )

    await waitFor(() => {
      expect(
        get('hero-track-chip', { 'stream-type': 'subtitle' }).dataset
          .selectedTrackId
      ).toBe(String(tracks.subtitle.id))
    })
  })

  test('popover offers an Off option for subtitle', async () => {
    const { media } = await seedMovieWithTracks()

    const { user } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('hero-track-chip', { 'stream-type': 'subtitle' })
      },
      { timeout: 5000 }
    )

    await user.click(get('hero-track-chip', { 'stream-type': 'subtitle' }))

    await waitFor(
      () => {
        expect(
          get('track-option', { 'track-id': 'off' }).dataset.selected
        ).toBe('true')
      },
      { timeout: 5000 }
    )
  })

  test('does not render chips when no scanned tracks exist', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('media-hero')
      },
      { timeout: 5000 }
    )

    expect(query('hero-track-chips')).toBeNull()
  })

  test('TV show auto-selects first episode video into watch-cta URL', async () => {
    const { media, episodes } = await TestSeed.library.tv({
      tmdbId: 1399,
      title: 'Breaking Bad',
      year: 2008,
      imdbId: 'tt0903747',
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodeCount: 2,
          episodes: [
            { episodeNumber: 1, title: 'Pilot' },
            { episodeNumber: 2, title: "Cat's in the Bag..." },
          ],
        },
      ],
    })

    const { file } = await TestSeed.player.downloadWithTracks(
      media.id,
      'bb-s01e01',
      '/tv/Breaking.Bad.S01E01.mkv',
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
          channels: 2,
          channel_layout: 'stereo',
          language: 'eng',
        },
      ],
      { keyframes: [0, 10], duration: 20, episode_id: episodes[0].id }
    )

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const videoTrack = tracks.find((t) => t.stream_type === 'video')!

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        const link = slot(get('media-hero'), 'watch-cta').querySelector(
          'a'
        ) as HTMLAnchorElement
        const url = new URL(link.href, 'http://localhost')
        expect(url.searchParams.get('video')).toBe(String(videoTrack.id))
      },
      { timeout: 5000 }
    )
  })

  test('TV show episode switch updates watch-cta URL with new video', async () => {
    const { media, episodes } = await TestSeed.library.tv({
      tmdbId: 1399,
      title: 'Breaking Bad',
      year: 2008,
      imdbId: 'tt0903747',
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodeCount: 2,
          episodes: [
            { episodeNumber: 1, title: 'Pilot' },
            { episodeNumber: 2, title: "Cat's in the Bag..." },
          ],
        },
      ],
    })

    const { file: file1 } = await TestSeed.player.downloadWithTracks(
      media.id,
      'bb-s01e01',
      '/tv/Breaking.Bad.S01E01.mkv',
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
          channels: 2,
          channel_layout: 'stereo',
          language: 'eng',
        },
      ],
      { keyframes: [0, 10], duration: 20, episode_id: episodes[0].id }
    )

    const { file: file2 } = await TestSeed.player.downloadWithTracks(
      media.id,
      'bb-s01e02',
      '/tv/Breaking.Bad.S01E02.mkv',
      [
        {
          stream_index: 0,
          stream_type: 'video',
          codec_name: 'hevc',
          is_default: true,
          width: 3840,
          height: 2160,
        },
        {
          stream_index: 1,
          stream_type: 'audio',
          codec_name: 'aac',
          is_default: true,
          channels: 2,
          channel_layout: 'stereo',
          language: 'eng',
        },
      ],
      { keyframes: [0, 10], duration: 20, episode_id: episodes[1].id }
    )

    const ep1Tracks = await DbMediaTracks.getByMediaFileId(file1.id)
    const ep1Video = ep1Tracks.find((t) => t.stream_type === 'video')!
    const ep2Tracks = await DbMediaTracks.getByMediaFileId(file2.id)
    const ep2Video = ep2Tracks.find((t) => t.stream_type === 'video')!

    const { user } = mountApp(`/media/${media.id}`)

    function getWatchUrl() {
      const link = slot(get('media-hero'), 'watch-cta').querySelector(
        'a'
      ) as HTMLAnchorElement

      return new URL(link.href, 'http://localhost')
    }

    await waitFor(
      () => {
        expect(getWatchUrl().searchParams.get('video')).toBe(
          String(ep1Video.id)
        )
      },
      { timeout: 5000 }
    )

    await user.click(slot(get('media-hero'), 'episode-picker-trigger'))

    await waitFor(() => {
      document.querySelector(
        '[data-slot="episode-option"][data-episode-number="2"]'
      )
    })

    const ep2 = document.querySelector(
      '[data-slot="episode-option"][data-episode-number="2"]'
    ) as HTMLElement

    await user.click(ep2)

    await waitFor(() => {
      expect(getWatchUrl().searchParams.get('video')).toBe(String(ep2Video.id))
    })
  })
})

describe('Watch CTA navigation', () => {
  test('watch-cta link carries selected track IDs', async () => {
    const { media, tracks } = await seedMovieWithTracks()

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        expect(
          get('hero-track-chip', { 'stream-type': 'audio' }).dataset
            .selectedTrackId
        ).toBe(String(tracks.audio.id))
      },
      { timeout: 5000 }
    )

    const link = slot(get('media-hero'), 'watch-cta').querySelector(
      'a'
    ) as HTMLAnchorElement

    const url = new URL(link.href, 'http://localhost')

    expect(url.pathname).toBe(`/media/${media.id}/play`)
    expect(url.searchParams.get('video')).toBe(String(tracks.video.id))
    expect(url.searchParams.get('audio')).toBe(String(tracks.audio.id))
  })
})
