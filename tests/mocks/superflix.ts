import { tmpdir } from 'os'
import { join } from 'path'

import { FFmpegBuilder } from '@lobomfz/ffmpeg'
import { Mock } from '@lobomfz/ghostapi'
import { type } from '@lobomfz/db'

import { envVariables } from '@/lib/env'

const baseUrl = envVariables.SUPERFLIX_API_URL

const audioChunkPath = join(
  tmpdir(),
  `omnarr-sfx-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`
)
const videoChunkPath = join(
  tmpdir(),
  `omnarr-sfx-video-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`
)

await Promise.all([
  new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input('anullsrc=r=48000:cl=stereo')
    .duration(1)
    .codec('a', 'aac')
    .format('mpegts')
    .output(audioChunkPath)
    .run(),
  new FFmpegBuilder({ overwrite: true })
    .rawInput('-f', 'lavfi')
    .input('color=c=black:s=160x120:r=1')
    .duration(1)
    .codec('v', 'libx264')
    .preset('ultrafast')
    .format('mpegts')
    .output(videoChunkPath)
    .run(),
])

const audioChunk = new Uint8Array(await Bun.file(audioChunkPath).arrayBuffer())
const videoChunk = new Uint8Array(await Bun.file(videoChunkPath).arrayBuffer())

const SuperflixMock = new Mock(
  {
    films: type({
      imdb_id: 'string',
      content_id: 'number',
      video_id: 'number',
    }),
    audio_streams: type({
      video_id: 'number',
      lang: 'string',
    }),
    episodes: type({
      imdb_id: 'string',
      season: 'number',
      episode: 'number',
      content_id: 'number',
      video_id: 'number',
    }),
  },
  (app, { db }) => {
    // Step 1: GET /filme/:imdbId → HTML with JS vars
    app.get('/filme/:imdbId', async ({ params }) => {
      const film = await db
        .selectFrom('films')
        .select(['content_id', 'video_id'])
        .where('imdb_id', '=', params.imdbId)
        .executeTakeFirst()

      if (!film) {
        return new Response('<html><body>Not found</body></html>', {
          headers: { 'content-type': 'text/html' },
        })
      }

      const html = `<html><head><script>
var INITIAL_CONTENT_ID = ${film.content_id};
var CONTENT_TYPE = "filme";
var CSRF_TOKEN = "mock-csrf-token";
var PAGE_TOKEN = "mock-page-token";
var API_URL_OPTIONS = "${baseUrl}/player/options";
var API_URL_SOURCE = "${baseUrl}/player/source";
</script></head><body></body></html>`

      return new Response(html, {
        headers: { 'content-type': 'text/html' },
      })
    })

    // Step 2: POST /player/options → returns video options
    app.post('/player/options', async ({ body }) => {
      const params =
        typeof body === 'string'
          ? Object.fromEntries(new URLSearchParams(body))
          : (body as Record<string, string>)

      const film = await db
        .selectFrom('films')
        .select('video_id')
        .where('content_id', '=', Number(params.contentid))
        .executeTakeFirst()

      if (!film) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
        })
      }

      return {
        data: {
          options: [
            {
              ID: film.video_id,
              type: 1,
              name: `Servidor ${film.video_id}`,
              is_file: false,
              can_download: false,
            },
          ],
          flags: {
            mp4_active: true,
            mp4_download: false,
            native_player_active: false,
            blogger_active: false,
          },
        },
      }
    })

    // Step 3: POST /player/source → returns redirect URL
    app.post('/player/source', ({ body }) => {
      const params =
        typeof body === 'string'
          ? Object.fromEntries(new URLSearchParams(body))
          : (body as Record<string, string>)

      return {
        data: {
          video_url: `${baseUrl}/player/redirect?t=${params.video_id}`,
        },
      }
    })

    // Step 4: GET /player/redirect → redirects to /video/:hash
    app.get('/player/redirect', ({ query }) => {
      return Response.redirect(`${baseUrl}/video/${query.t}`, 302)
    })

    app.get('/video/:hash', () => {
      return new Response('<html></html>', {
        headers: { 'content-type': 'text/html' },
      })
    })

    // Step 5: POST /player/index.php → returns videoSource
    app.post(
      '/player/index.php',
      ({ query }) => {
        return {
          videoSource: `${baseUrl}/hls/master/${query.data}`,
          hls: true,
          securedLink: '',
          videoImage: '',
          ck: '',
        }
      },
      {
        query: type({ data: 'string', do: 'string' }),
      }
    )

    // Step 6: GET /hls/master/:videoId → master playlist
    app.get('/hls/master/:videoId', async ({ params }) => {
      const streams = await db
        .selectFrom('audio_streams')
        .select('lang')
        .where('video_id', '=', Number(params.videoId))
        .execute()

      let playlist = '#EXTM3U\n#EXT-X-VERSION:3\n'

      for (const stream of streams) {
        playlist += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${stream.lang}",LANGUAGE="${stream.lang}",URI="${baseUrl}/hls/audio/${stream.lang}"\n`
      }

      playlist += `#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio"\n${baseUrl}/hls/video/${params.videoId}\n`

      return new Response(playlist, {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      })
    })

    app.get('/hls/video/:videoId', ({ params }) => {
      if (params.videoId === '77') {
        return new Response('Not found', { status: 500 })
      }

      const playlist = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:1',
        '#EXTINF:1.0,',
        `${baseUrl}/hls/vchunk/0`,
        '#EXT-X-ENDLIST',
      ].join('\n')

      return new Response(playlist, {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      })
    })

    app.get('/hls/audio/:lang', () => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:1',
        '#EXTINF:1.0,',
        `${baseUrl}/hls/chunk/0`,
        '#EXT-X-ENDLIST',
      ].join('\n')

      return new Response(playlist, {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      })
    })

    app.get('/hls/vchunk/:id', () => {
      return new Response(videoChunk, {
        headers: { 'content-type': 'video/mp2t' },
      })
    })

    app.get('/hls/chunk/:id', () => {
      return new Response(audioChunk, {
        headers: { 'content-type': 'video/mp2t' },
      })
    })

    app.get('/serie/:imdbId', async ({ params }) => {
      const eps = await db
        .selectFrom('episodes')
        .selectAll()
        .where('imdb_id', '=', params.imdbId)
        .execute()

      if (eps.length === 0) {
        return new Response('Not found', { status: 404 })
      }

      const grouped: Record<string, unknown[]> = {}

      for (const ep of eps) {
        const key = String(ep.season)

        if (!grouped[key]) {
          grouped[key] = []
        }

        grouped[key].push({
          ID: ep.content_id,
          epi_num: ep.episode,
          title: `Episode ${ep.episode}`,
          season: ep.season,
        })
      }

      return new Response(
        `<html><head><script>var ALL_EPISODES = ${JSON.stringify(grouped)};</script></head></html>`,
        { headers: { 'content-type': 'text/html' } }
      )
    })

    app.get('/serie/:imdbId/:season/:episode', async ({ params }) => {
      const ep = await db
        .selectFrom('episodes')
        .select('content_id')
        .where('imdb_id', '=', params.imdbId)
        .where('season', '=', Number(params.season))
        .where('episode', '=', Number(params.episode))
        .executeTakeFirst()

      if (!ep) {
        return new Response('Not found', { status: 404 })
      }

      const html = `<html><head><script>
var INITIAL_CONTENT_ID = ${ep.content_id};
var CONTENT_TYPE = "serie";
var CSRF_TOKEN = "mock-csrf-token";
var PAGE_TOKEN = "mock-page-token";
var API_URL_OPTIONS = "${baseUrl}/player/options";
var API_URL_SOURCE = "${baseUrl}/player/source";
</script></head><body></body></html>`

      return new Response(html, {
        headers: { 'content-type': 'text/html' },
      })
    })
  },
  { base_url: baseUrl }
)

await SuperflixMock.db
  .insertInto('films')
  .values([
    { imdb_id: 'tt0133093', content_id: 100, video_id: 42 },
    { imdb_id: 'tt0000000', content_id: 200, video_id: 99 },
    { imdb_id: 'tt0000001', content_id: 300, video_id: 77 },
    { imdb_id: 'tt0000003', content_id: 999, video_id: 0 },
    { imdb_id: 'tt0903747', content_id: 400, video_id: 50 },
    { imdb_id: 'tt0903747', content_id: 401, video_id: 51 },
    { imdb_id: 'tt0903747', content_id: 402, video_id: 52 },
  ])
  .execute()

await SuperflixMock.db
  .insertInto('audio_streams')
  .values([
    { video_id: 42, lang: 'pt' },
    { video_id: 42, lang: 'en' },
    { video_id: 77, lang: 'es' },
    { video_id: 0, lang: 'pt' },
    { video_id: 50, lang: 'pt' },
    { video_id: 50, lang: 'en' },
    { video_id: 51, lang: 'pt' },
    { video_id: 51, lang: 'en' },
    { video_id: 52, lang: 'pt' },
    { video_id: 52, lang: 'en' },
  ])
  .execute()

await SuperflixMock.db
  .insertInto('episodes')
  .values([
    {
      imdb_id: 'tt0903747',
      season: 1,
      episode: 1,
      content_id: 400,
      video_id: 50,
    },
    {
      imdb_id: 'tt0903747',
      season: 1,
      episode: 2,
      content_id: 401,
      video_id: 51,
    },
    {
      imdb_id: 'tt0903747',
      season: 1,
      episode: 3,
      content_id: 402,
      video_id: 52,
    },
  ])
  .execute()
