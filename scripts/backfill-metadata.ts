import { Database } from 'bun:sqlite'
import { join } from 'node:path'

const xdgDataHome =
  process.env.XDG_DATA_HOME ?? join(process.env.HOME!, '.local/share')
const dbPath =
  process.env.OMNARR_DB_PATH ?? join(xdgDataHome, 'omnarr/db.sqlite')
const apiKey = 'a17968d48d23bbc9765e23cbb779597a'
const baseUrl = 'https://api.themoviedb.org/3'

const sqlite = new Database(dbPath)

const rows = sqlite
  .query<{ id: number; tmdb_id: number; media_type: string }, []>(
    'SELECT id, tmdb_id, media_type FROM tmdb_media WHERE runtime IS NULL OR genres IS NULL'
  )
  .all()

console.log(`Found ${rows.length} entries to backfill`)

for (const row of rows) {
  const url = `${baseUrl}/${row.media_type}/${row.tmdb_id}?api_key=${apiKey}`
  const res = await fetch(url)

  if (!res.ok) {
    console.log(`SKIP id=${row.id} tmdb_id=${row.tmdb_id} status=${res.status}`)
    continue
  }

  const data = (await res.json()) as {
    runtime?: number | null
    episode_run_time?: number[]
    vote_average?: number | null
    genres?: { id: number; name: string }[]
  }

  const runtime =
    data.runtime ??
    (data.episode_run_time?.length
      ? Math.round(
          data.episode_run_time.reduce((a, b) => a + b, 0) /
            data.episode_run_time.length
        )
      : null)

  const voteAverage = data.vote_average ?? null
  const genres = data.genres?.map((g) => g.name).join(',') ?? null

  sqlite.run(
    'UPDATE tmdb_media SET runtime = ?, vote_average = ?, genres = ? WHERE id = ?',
    [runtime, voteAverage, genres, row.id]
  )

  console.log(
    `OK id=${row.id} tmdb_id=${row.tmdb_id} runtime=${runtime} vote=${voteAverage} genres=${genres}`
  )
}

console.log('Done')
