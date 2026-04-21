import '../../setup-dom'
import '../../../helpers/api-server'
import '../../../mocks/tmdb'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { DbMediaTracks } from '@/db/media-tracks'

import { TestSeed } from '../../../helpers/seed'
import { get, slot } from '../../dom'
import { mountApp } from '../../mount-app'
import { cleanup, fireEvent, waitFor } from '../../testing-library'

beforeEach(() => {
  TestSeed.reset()
})

afterEach(async () => {
  await cleanup()
})

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

describe('track selector', () => {
  test('renders track options for video, audio, and subtitle', async () => {
    const { media, tracks } = await seedMovieWithTracks()

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('track-selector')
        get('track-option', { 'track-id': String(tracks.video.id) })
        get('track-option', { 'track-id': String(tracks.audio.id) })
        get('track-option', { 'track-id': String(tracks.subtitle.id) })
      },
      { timeout: 5000 }
    )
  })

  test('pre-selects video and audio tracks with is_default flag', async () => {
    const { media, tracks } = await seedMovieWithTracks()

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        expect(
          get('track-option', { 'track-id': String(tracks.video.id) }).dataset
            .selected
        ).toBe('true')
        expect(
          get('track-option', { 'track-id': String(tracks.audio.id) }).dataset
            .selected
        ).toBe('true')
      },
      { timeout: 5000 }
    )
  })

  test('subtitle not pre-selected when is_default is false', async () => {
    const { media, tracks } = await seedMovieWithTracks()

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        expect(
          get('track-option', { 'track-id': String(tracks.subtitle.id) })
            .dataset.selected
        ).toBe('false')
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
          get('track-option', { 'track-id': String(eng.id) }).dataset.selected
        ).toBe('true')
        expect(
          get('track-option', { 'track-id': String(por.id) }).dataset.selected
        ).toBe('false')
      },
      { timeout: 5000 }
    )

    await user.click(get('track-option', { 'track-id': String(por.id) }))

    await waitFor(() => {
      expect(
        get('track-option', { 'track-id': String(por.id) }).dataset.selected
      ).toBe('true')
      expect(
        get('track-option', { 'track-id': String(eng.id) }).dataset.selected
      ).toBe('false')
    })
  })

  test('subtitle can be toggled on and off', async () => {
    const { media, tracks } = await seedMovieWithTracks()

    const { user } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        expect(
          get('track-option', { 'track-id': String(tracks.subtitle.id) })
            .dataset.selected
        ).toBe('false')
      },
      { timeout: 5000 }
    )

    await user.click(
      get('track-option', { 'track-id': String(tracks.subtitle.id) })
    )

    await waitFor(() => {
      expect(
        get('track-option', { 'track-id': String(tracks.subtitle.id) }).dataset
          .selected
      ).toBe('true')
    })

    await user.click(
      get('track-option', { 'track-id': String(tracks.subtitle.id) })
    )

    await waitFor(() => {
      expect(
        get('track-option', { 'track-id': String(tracks.subtitle.id) }).dataset
          .selected
      ).toBe('false')
    })
  })

  test('shows empty state when no scanned tracks exist', async () => {
    const media = await TestSeed.library.matrix()
    await TestSeed.downloads.completed(media.id)

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('track-selector-empty')
      },
      { timeout: 5000 }
    )
  })

  test('TV show auto-selects first episode of season 1 on page load', async () => {
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
      ],
      { keyframes: [0, 10], duration: 20, episode_id: episodes[0].id }
    )

    const tracks = await DbMediaTracks.getByMediaFileId(file.id)
    const videoTrack = tracks.find((t) => t.stream_type === 'video')!

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('track-option', { 'track-id': String(videoTrack.id) })
      },
      { timeout: 5000 }
    )
  })

  test('TV show tracks reflect selected episode', async () => {
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
          language: 'eng',
        },
      ],
      { keyframes: [0, 10], duration: 20, episode_id: episodes[0].id }
    )

    await TestSeed.player.downloadWithTracks(
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
          codec_name: 'ac3',
          is_default: true,
          channels: 6,
          language: 'eng',
        },
      ],
      { keyframes: [0, 10], duration: 20, episode_id: episodes[1].id }
    )

    const ep1Tracks = await DbMediaTracks.getByMediaFileId(file1.id)
    const ep1Video = ep1Tracks.find((t) => t.stream_type === 'video')!

    mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        get('season-picker')
      },
      { timeout: 5000 }
    )

    fireEvent.change(get('season-picker'), { target: { value: '1' } })

    await waitFor(() => {
      get('episode-picker')
    })

    fireEvent.change(get('episode-picker'), { target: { value: '1' } })

    await waitFor(() => {
      get('track-option', { 'track-id': String(ep1Video.id) })
    })
  })
})

describe('Watch Now navigation', () => {
  test('navigates to player route with selected track IDs', async () => {
    const { media, tracks } = await seedMovieWithTracks()

    const { user, router } = mountApp(`/media/${media.id}`)

    await waitFor(
      () => {
        expect(
          get('track-option', { 'track-id': String(tracks.video.id) }).dataset
            .selected
        ).toBe('true')
      },
      { timeout: 5000 }
    )

    await user.click(slot(get('media-hero'), 'watch-now'))

    await waitFor(() => {
      const url = new URL(router.state.location.href, 'http://localhost')

      expect(url.pathname).toBe(`/media/${media.id}/play`)
      expect(url.searchParams.get('video')).toBe(String(tracks.video.id))
      expect(url.searchParams.get('audio')).toBe(String(tracks.audio.id))
    })
  })
})
