import { resolve } from 'path'

import { type, type Type } from '@lobomfz/db'

import { PubSub } from '@/api/pubsub'
import { MIN_SYNC_CONFIDENCE } from '@/audio/audio-correlator'
import { client } from '@/cli/client'
import { connectWs } from '@/cli/ws-client'
import { Exporter } from '@/core/exporter'
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import { DbReleases } from '@/db/releases'
import { DbSearchResults } from '@/db/search-results'
import { Formatters } from '@/lib/formatters'
import { Log } from '@/lib/log'
import { extractSchemaProps } from '@/lib/utils'
import { Player } from '@/player/player'

export class Handler {
  constructor(
    private positional: string[],
    private json: boolean | undefined
  ) {}

  private output(data: unknown, display?: string | Record<string, unknown>[]) {
    if (this.json) {
      console.log(JSON.stringify(data))
      return
    }

    const out = display ?? data

    if (typeof out === 'string') {
      console.log(out)
    } else {
      console.table(out)
    }
  }

  private parseArgs<T extends Type>(command: string, schema: T): T['infer'] {
    const { keys, required } = extractSchemaProps(schema)

    const obj: Record<string, string> = {}

    for (let i = 0; i < keys.length && i < this.positional.length; i++) {
      obj[keys[i]] = this.positional[i]
    }

    const result = schema(obj)

    if (result instanceof type.errors) {
      const usage = keys
        .map((k) => (required.has(k) ? `<${k}>` : `[${k}]`))
        .join(' ')

      throw new Error(`Usage: omnarr ${command} ${usage}`)
    }

    return result
  }

  async info(opts?: { season?: number; episode?: number }) {
    const { media_id } = this.parseArgs('info', type({ media_id: 'string' }))

    const info = await client.library.getInfo({
      id: media_id,
      season: opts?.season,
      episode: opts?.episode,
    })

    this.output(info, Formatters.mediaInfo(info))
  }

  async search() {
    const { query } = this.parseArgs('search', type({ query: 'string' }))

    Log.info(`command=search query="${query}"`)

    const results = await client.tmdb.search({ query })

    if (results.length === 0) {
      console.log('No results found.')
      return
    }

    this.output(
      results,
      results.map((r) => ({
        ID: r.id,
        Type: r.media_type,
        Year: r.year?.toString() ?? '—',
        Title: r.title,
      }))
    )
  }

  async releases(opts?: { season?: number }) {
    const { search_id } = this.parseArgs(
      'releases',
      type({ search_id: 'string' })
    )

    Log.info(`command=releases search_id=${search_id}`)

    const searchResult = await DbSearchResults.getById(search_id)

    if (!searchResult) {
      throw new Error(
        `Search result '${search_id}' not found. Run 'omnarr search' first.`
      )
    }

    if (searchResult.media_type === 'tv' && opts?.season === undefined) {
      throw new Error(
        'TV shows require --season. Use search to see available media.'
      )
    }

    const { releases } = await client.releases.search({
      tmdb_id: searchResult.tmdb_id,
      media_type: searchResult.media_type,
      season_number: opts?.season,
    })

    if (releases.length === 0) {
      console.log('No releases found.')
      return
    }

    this.output(
      releases,
      releases.map((r) => {
        const meta = [r.resolution, r.codec, r.hdr].filter(Boolean).join(' ')
        return {
          ID: r.id,
          Source: r.indexer_source,
          Seeds: Formatters.seeders(r.seeders),
          Size: Formatters.size(r.size),
          Quality: meta,
          Name: r.name,
        }
      })
    )
  }

  async download(opts?: { audio_only?: boolean }) {
    const { release_id } = this.parseArgs(
      'download',
      type({ release_id: 'string' })
    )

    Log.info(`command=download release_id=${release_id}`)

    const release = await DbReleases.getById(release_id)

    if (!release) {
      throw new Error(
        `Release '${release_id}' not found. Run 'omnarr releases' or 'omnarr subtitles' first.`
      )
    }

    const result = await client.downloads.add({
      release_id,
      audio_only: opts?.audio_only,
    })

    this.output(
      result,
      `Enqueued: ${result.title}${result.year ? ` (${result.year})` : ''}`
    )
  }

  private async listDownloads(limit: number, clear = false) {
    const downloads = await client.downloads.list({ limit })

    if (downloads.length === 0) {
      console.log('No downloads.')
      return
    }

    const parsed = downloads.map((d) => ({
      Title: Formatters.mediaTitle(d),
      Progress: Formatters.progress(d.progress),
      Speed: Formatters.speed(d.speed),
      ETA: Formatters.eta(d.eta),
      Status: d.status,
    }))

    if (clear) {
      console.clear()
    }

    this.output(parsed)
  }

  async status(opts: { watch?: boolean; limit?: number }) {
    const limit = opts.limit ?? 10

    if (!opts.watch) {
      await this.listDownloads(limit)
      return
    }

    await this.listDownloads(limit)

    const wsClient = connectWs()

    for await (const _event of await wsClient.downloadProgress()) {
      await this.listDownloads(limit, true)
    }
  }

  async scan(opts: { force?: boolean }) {
    const { media_id } = this.parseArgs('scan', type({ media_id: 'string' }))

    Log.info(`command=scan media_id=${media_id}`)

    await client.library.rescan({
      media_id,
      force: opts.force,
    })

    console.log(`Scan enqueued for ${media_id}.`)
  }

  async play(opts: {
    port?: number
    video?: number
    audio?: number
    sub?: number
    season?: number
    episode?: number
  }) {
    const { media_id } = this.parseArgs('play', type({ media_id: 'string' }))

    const media = await DbMedia.getById(media_id)

    if (!media) {
      throw new Error(`Media '${media_id}' not found.`)
    }

    const episodeId = await this.resolveEpisodeForTv(
      media,
      opts.season,
      opts.episode
    )

    const player = new Player({ id: media_id, episode_id: episodeId })
    const result = await player.start(
      { video: opts.video, audio: opts.audio, sub: opts.sub },
      { port: opts.port }
    )

    const displayLines = [
      Formatters.mediaTitle(media),
      Formatters.trackSummary('video', result.video),
      Formatters.trackSummary('audio', result.audio),
    ]

    if (result.subtitle) {
      displayLines.push(Formatters.trackSummary('subtitle', result.subtitle))
    }

    if (result.audioOffset !== 0) {
      displayLines.push(`audio offset: ${result.audioOffset.toFixed(3)}s`)
    }

    if (result.subtitleOffset !== 0) {
      displayLines.push(`subtitle offset: ${result.subtitleOffset.toFixed(3)}s`)
    }

    if (
      result.subtitleConfidence !== null &&
      result.subtitleConfidence < MIN_SYNC_CONFIDENCE
    ) {
      displayLines.push(
        `⚠ subtitle sync confidence is low (${result.subtitleConfidence.toFixed(1)}), subtitles may be out of sync`
      )
    }

    displayLines.push('', result.url)

    this.output(result, displayLines.join('\n'))

    await player.play(result.url)
  }

  private async resolveEpisodeForTv(
    media: { media_type: string; tmdb_media_id: number },
    season?: number,
    episode?: number
  ) {
    if (media.media_type !== 'tv') {
      return
    }

    if (season === undefined || episode === undefined) {
      throw new Error(
        'TV shows require --season and --episode. Use info to see available episodes.'
      )
    }

    const ep = await DbEpisodes.getBySeasonEpisode(
      media.tmdb_media_id,
      season,
      episode
    )

    if (!ep) {
      throw new Error(
        `Episode S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} not found.`
      )
    }

    return ep.id
  }

  async library() {
    const media = await client.library.list({})

    if (media.length === 0) {
      console.log('Library is empty.')
      return
    }

    this.output(
      media,
      media.map((m) => ({
        ID: m.id,
        Type: m.media_type,
        Title: Formatters.mediaTitle(m),
        Status: Formatters.mediaStatus(m),
      }))
    )
  }

  async subtitles(opts?: {
    auto?: boolean
    season?: number
    episode?: number
    lang?: string
  }) {
    const { media_id } = this.parseArgs(
      'subtitles',
      type({ media_id: 'string' })
    )

    Log.info(`command=subtitles media_id=${media_id}`)

    if (opts?.auto) {
      const result = await client.subtitles.autoMatch({
        media_id,
        season: opts.season,
        episode: opts.episode,
        lang: opts.lang,
      })

      this.output(result, `Auto-match enqueued for ${media_id}.`)

      return
    }

    const results = await client.subtitles.search({
      media_id,
      season: opts?.season,
      episode: opts?.episode,
      lang: opts?.lang,
    })

    if (results.length === 0) {
      console.log('No subtitles found.')
      return
    }

    this.output(
      results,
      results.map((r) => ({
        ID: r.id,
        Name: r.name,
        Language: r.language ?? '',
      }))
    )
  }

  async export(opts: { video?: number; season?: number; episode?: number }) {
    const { media_id, output } = this.parseArgs(
      'export',
      type({ media_id: 'string', output: 'string' })
    )

    const media = await DbMedia.getById(media_id)

    if (!media) {
      throw new Error(`Media '${media_id}' not found.`)
    }

    const episodeId = await this.resolveEpisodeForTv(
      media,
      opts.season,
      opts.episode
    )

    Log.info(`command=export media_id=${media_id} output=${output}`)

    const outputPath = resolve(output)

    const exporter = new Exporter({ id: media_id, episode_id: episodeId })
    const controller = new AbortController()
    const consumer = this.consumeExportProgress(
      media_id,
      outputPath,
      controller.signal
    )

    let strategy: 'hardlink' | 'mux'

    try {
      strategy = await exporter.export({
        video: opts.video,
        output: outputPath,
      })
    } finally {
      controller.abort()
      await consumer
    }

    if (strategy === 'hardlink') {
      this.output({ output: outputPath }, `Linked: ${outputPath}`)
    } else {
      this.output({ output: outputPath }, `Exported: ${outputPath}`)
    }
  }

  private async consumeExportProgress(
    media_id: string,
    outputPath: string,
    signal: AbortSignal
  ) {
    if (this.json || !process.stdout.isTTY) {
      return
    }

    try {
      for await (const event of PubSub.subscribe('export_progress', signal)) {
        if (event.media_id !== media_id || event.output !== outputPath) {
          continue
        }

        const pct = Formatters.progress(event.ratio)

        process.stdout.write(`\rExporting ${pct}`)

        if (event.ratio >= 1) {
          process.stdout.write('\n')
        }
      }
    } catch (err) {
      if (signal.aborted) {
        return
      }

      throw err
    }
  }
}
