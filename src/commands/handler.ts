import { resolve } from 'path'

import { type, type Type } from '@lobomfz/db'

import { MIN_SYNC_CONFIDENCE } from '@/audio/audio-correlator'
import { Downloads } from '@/core/downloads'
import { Exporter } from '@/core/exporter'
import { Releases } from '@/core/releases'
import { Scanner } from '@/core/scanner'
import { SubtitleMatcher } from '@/core/subtitle-matcher'
import { TorrentSync } from '@/core/torrent-sync'
import { DbDownloads } from '@/db/downloads'
import { DbEpisodes } from '@/db/episodes'
import { DbMedia } from '@/db/media'
import { DbMediaFiles } from '@/db/media-files'
import { DbReleases } from '@/db/releases'
import { DbSearchResults } from '@/db/search-results'
import { TmdbClient } from '@/integrations/tmdb/client'
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

    const info = await DbMedia.getInfo(media_id, opts)

    if (!info) {
      throw new Error(`Media '${media_id}' not found.`)
    }

    this.output(info, Formatters.mediaInfo(info))
  }

  async search() {
    const { query } = this.parseArgs('search', type({ query: 'string' }))

    Log.info(`command=search query="${query}"`)

    const tmdbResults = await new TmdbClient().search(query)

    Log.info(`tmdb returned ${tmdbResults.length} results query="${query}"`)

    if (tmdbResults.length === 0) {
      console.log('No results found.')
      return
    }

    const results = await DbSearchResults.upsert(tmdbResults)

    Log.info(`search results persisted count=${results.length}`)

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

    const results = await new Releases().search(
      searchResult.tmdb_id,
      searchResult.media_type,
      opts
    )

    if (results.length === 0) {
      console.log('No releases found.')
      return
    }

    this.output(
      results,
      results.map((r) => {
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

  async download(opts?: {
    audio_only?: boolean
    lang?: string
    concurrency?: number
  }) {
    const { release_id } = this.parseArgs(
      'download',
      type({ release_id: 'string' })
    )

    Log.info(`command=download release_id=${release_id}`)

    const release = await DbReleases.getById(release_id)

    if (!release) {
      throw new Error(
        `Release '${release_id}' not found. Run 'omnarr releases' first.`
      )
    }

    const result = await new Downloads().add(
      release,
      (tag, status, progress) => {
        if (this.json || !process.stdout.isTTY) {
          return
        }

        const pct = Formatters.progress(progress)

        process.stdout.write(`\r${tag}: ${status} ${pct}`)

        if (status === 'completed' || status === 'processing') {
          process.stdout.write('\n')
        }
      },
      opts
    )

    this.output(result, `Added: ${Formatters.mediaTitle(result)}`)
  }

  private async listDownloads(limit: number, clear = false) {
    await new TorrentSync().sync()

    const downloads = await DbDownloads.list(limit)

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

    while (true) {
      await this.listDownloads(limit, true)
      await Bun.sleep(2000)
    }
  }

  async waitFor() {
    const { release_id } = this.parseArgs(
      'wait-for',
      type({ release_id: 'string' })
    )

    Log.info(`command=wait-for release_id=${release_id}`)

    const release = await DbReleases.getById(release_id)

    if (!release) {
      throw new Error(`Release '${release_id}' not found.`)
    }

    const interval = 5 * 1000

    while (true) {
      await new TorrentSync().sync()

      const download = await DbDownloads.getBySourceId(release.source_id)

      if (!download) {
        throw new Error(`No download found for release '${release_id}'`)
      }

      if (download.status === 'completed') {
        Log.info(`download completed release_id=${release_id}`)
        this.output(download, `Done: ${Formatters.mediaTitle(download)}`)
        return
      }

      if (download.status === 'error') {
        Log.warn(`download failed release_id=${release_id}`)
        throw new Error(`Download failed: ${Formatters.mediaTitle(download)}`)
      }

      await Bun.sleep(interval)
    }
  }

  async scan(opts: { force?: boolean; concurrency?: number }) {
    const { media_id } = this.parseArgs('scan', type({ media_id: 'string' }))

    Log.info(`command=scan media_id=${media_id} force=${!!opts.force}`)

    let lastWrite = 0
    let doneFile = -1

    const files = await new Scanner().scan(
      media_id,
      (current, total, path, ratio) => {
        if (this.json || !process.stdout.isTTY) {
          return
        }

        if (ratio >= 1 && current === doneFile) {
          return
        }

        const now = Date.now()

        if (ratio < 1 && now - lastWrite < 100) {
          return
        }

        lastWrite = now

        const pct = Formatters.progress(ratio)
        process.stdout.write(
          `\rScanning ${current}/${total} (${pct}): ${path.split('/').at(-1)}`
        )

        if (ratio >= 1) {
          doneFile = current
          process.stdout.write('\n')
        }
      },
      opts
    )

    if (files.length === 0) {
      console.log('No media files found.')
      return
    }

    const result = await DbMediaFiles.getWithScanData(media_id)

    this.output(result, Formatters.scanResult(result))
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
    const media = await DbMedia.list({})

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
      return await this.autoMatchSubtitles(media_id, opts)
    }

    const results = await new Releases().searchSubtitles(media_id, opts)

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

  private async autoMatchSubtitles(
    media_id: string,
    opts: { season?: number; episode?: number; lang?: string }
  ) {
    const media = await DbMedia.getById(media_id)

    if (!media) {
      throw new Error(`Media '${media_id}' not found.`)
    }

    const episodeId = await this.resolveEpisodeForTv(
      media,
      opts.season,
      opts.episode
    )

    const matcher = new SubtitleMatcher({ id: media_id, episode_id: episodeId })

    const result = await matcher.match(opts, (info) => {
      if (this.json || !process.stdout.isTTY) {
        return
      }

      if (info.status === 'downloading') {
        console.log(`\n  ${info.name}`)
        process.stdout.write('    downloading...')
        return
      }

      if (info.status === 'testing') {
        process.stdout.write(' testing...')
        return
      }

      if (info.status === 'matched') {
        console.log(` confidence: ${info.confidence!.toFixed(1)} ✓`)
        return
      }

      if (info.confidence === null) {
        console.log(' failed')
      } else {
        console.log(` confidence: ${info.confidence.toFixed(1)} ✗`)
      }
    })

    if (result.matched) {
      const lines = [
        '',
        `Subtitle synced: ${result.matched.name}`,
        `offset: ${result.matched.offset.toFixed(3)}s | confidence: ${result.matched.confidence!.toFixed(1)}`,
      ]

      this.output(result, lines.join('\n'))
    } else {
      const lines = [
        '',
        `No subtitle matched with sufficient confidence (min: ${MIN_SYNC_CONFIDENCE})`,
        `${result.tested.length} subtitles saved — use play --sub to try manually`,
      ]

      this.output(result, lines.join('\n'))
    }
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

    let lastWrite = 0

    const exporter = new Exporter({ id: media_id, episode_id: episodeId })

    await exporter.export({
      video: opts.video,
      output: outputPath,
      onProgress: (ratio) => {
        if (this.json || !process.stdout.isTTY) {
          return
        }

        const now = Date.now()

        if (ratio < 1 && now - lastWrite < 100) {
          return
        }

        lastWrite = now

        const pct = Formatters.progress(ratio)

        process.stdout.write(`\rExporting ${pct}`)

        if (ratio >= 1) {
          process.stdout.write('\n')
        }
      },
    })

    this.output({ output: outputPath }, `Exported: ${outputPath}`)
  }
}
