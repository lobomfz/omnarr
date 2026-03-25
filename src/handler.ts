import { type, type Type } from 'arktype'

import { DbMedia } from '@/db/media'
import { DbMediaTracks } from '@/db/media-tracks'
import { DbReleases } from '@/db/releases'
import { DbSearchResults } from '@/db/search-results'
import { Downloads } from '@/downloads'
import { Extractor } from '@/extractor'
import { Formatters } from '@/formatters'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Log } from '@/log'
import { Releases } from '@/releases'
import { Scanner } from '@/scanner'
import { extractSchemaProps } from '@/utils'

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

  async search() {
    const { query } = this.parseArgs('search', type({ query: 'string' }))

    await Log.info(`command=search query="${query}"`)

    const tmdbResults = await new TmdbClient().search(query)

    await Log.info(
      `tmdb returned ${tmdbResults.length} results query="${query}"`
    )

    if (tmdbResults.length === 0) {
      console.log('No results found.')
      return
    }

    const results = await DbSearchResults.upsert(
      tmdbResults.map((r) => ({
        tmdb_id: r.tmdb_id,
        media_type: r.media_type,
        title: r.title,
        year: r.year ?? undefined,
      }))
    )

    await Log.info(`search results persisted count=${results.length}`)

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

  async releases() {
    const { search_id } = this.parseArgs(
      'releases',
      type({ search_id: 'string' })
    )

    await Log.info(`command=releases search_id=${search_id}`)

    const searchResult = await DbSearchResults.getById(search_id)

    if (!searchResult) {
      throw new Error(
        `Search result '${search_id}' not found. Run 'omnarr search' first.`
      )
    }

    const results = await Releases.search(
      searchResult.tmdb_id,
      searchResult.media_type
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
          Seeds: `${r.seeders}S`,
          Size: Formatters.size(r.size),
          Quality: meta,
          Name: r.name,
        }
      })
    )
  }

  async download() {
    const { release_id } = this.parseArgs(
      'download',
      type({ release_id: 'string' })
    )

    await Log.info(`command=download release_id=${release_id}`)

    const release = await DbReleases.getById(release_id)

    if (!release) {
      throw new Error(
        `Release '${release_id}' not found. Run 'omnarr releases' first.`
      )
    }

    const result = await new Downloads().add({
      tmdb_id: release.tmdb_id,
      info_hash: release.info_hash,
      download_url: release.download_url,
      type: release.media_type,
    })

    this.output(result, `Added: ${Formatters.mediaTitle(result)}`)
  }

  private async listDownloads(limit: number, clear = false) {
    const downloads = await new Downloads().list(limit)

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

    process.on('SIGINT', () => process.exit(0))

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

    await Log.info(`command=wait-for release_id=${release_id}`)

    const release = await DbReleases.getById(release_id)

    if (!release) {
      throw new Error(`Release '${release_id}' not found.`)
    }

    const interval = 5 * 1000

    process.on('SIGINT', () => process.exit(0))

    while (true) {
      const download = await new Downloads().getByInfoHash(release.info_hash)

      if (!download) {
        throw new Error(`No download found for release '${release_id}'`)
      }

      if (download.status === 'completed') {
        await Log.info(`download completed release_id=${release_id}`)
        this.output(download, `Done: ${Formatters.mediaTitle(download)}`)
        return
      }

      if (download.status === 'error') {
        await Log.warn(`download failed release_id=${release_id}`)
        throw new Error(`Download failed: ${Formatters.mediaTitle(download)}`)
      }

      await Bun.sleep(interval)
    }
  }

  async scan(opts: { force?: boolean }) {
    const { media_id } = this.parseArgs('scan', type({ media_id: 'string' }))

    await Log.info(`command=scan media_id=${media_id} force=${!!opts.force}`)

    const files = await new Scanner().scan(media_id, opts)

    if (files.length === 0) {
      console.log('No media files found.')
      return
    }

    const allTracks = await DbMediaTracks.getByMediaId(media_id)

    const tracksByFile = Map.groupBy(allTracks, (t) => t.media_file_id)

    const result = files.map((f) => ({
      ...f,
      tracks: tracksByFile.get(f.id) ?? [],
    }))

    this.output(result, Formatters.scanResult(result))
  }

  async extract() {
    const { media_id } = this.parseArgs('extract', type({ media_id: 'string' }))

    await Log.info(`command=extract media_id=${media_id}`)

    const { failed } = await new Extractor().extract(media_id)

    const tracks = await DbMediaTracks.getByMediaId(media_id)

    if (tracks.length === 0) {
      console.log('No tracks to extract.')
      return
    }

    this.output({ tracks, failed }, Formatters.extractResult(tracks, failed))
  }

  async library() {
    const media = await DbMedia.list()

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
}
