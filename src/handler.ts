import { type, type Type } from 'arktype'

import { DbReleases } from '@/db/releases'
import { DbSearchResults } from '@/db/search-results'
import { Downloads } from '@/downloads'
import { Formatters } from '@/formatters'
import { TmdbClient } from '@/integrations/tmdb/client'
import { Releases } from '@/releases'

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
    const jsonSchema = schema.toJsonSchema()
    const keys = Object.keys((jsonSchema as any).properties ?? {})
    const required = new Set<string>((jsonSchema as any).required ?? [])

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

    const tmdbResults = await new TmdbClient().search(query)

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

  private async listDownloads(limit: number) {
    const downloads = await new Downloads().list(limit)

    if (downloads.length === 0) {
      console.log('No downloads.')
      return
    }

    this.output(
      downloads.map((d) => ({
        Title: Formatters.mediaTitle(d),
        Progress: Formatters.progress(d.progress),
        Speed: Formatters.speed(d.speed),
        ETA: Formatters.eta(d.eta),
        Status: d.status,
      }))
    )
  }

  async status(opts: { watch?: boolean; limit?: number }) {
    const limit = opts.limit ?? 10

    if (!opts.watch) {
      await this.listDownloads(limit)
      return
    }

    process.on('SIGINT', () => process.exit(0))

    while (true) {
      console.clear()
      await this.listDownloads(limit)
      await Bun.sleep(2000)
    }
  }

  async waitFor() {
    const { release_id } = this.parseArgs(
      'wait-for',
      type({ release_id: 'string' })
    )

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
        this.output(download, `Done: ${Formatters.mediaTitle(download)}`)
        return
      }

      if (download.status === 'error') {
        throw new Error(`Download failed: ${Formatters.mediaTitle(download)}`)
      }

      await Bun.sleep(interval)
    }
  }
}
