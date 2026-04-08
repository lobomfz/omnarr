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
    'SELECT id, tmdb_id, media_type FROM tmdb_media WHERE backdrop_path IS NULL'
  )
  .all()

console.log(`Found ${rows.length} entries without backdrop_path`)

for (const row of rows) {
  const url = `${baseUrl}/${row.media_type}/${row.tmdb_id}?api_key=${apiKey}`
  const res = await fetch(url)

  if (!res.ok) {
    console.log(`SKIP id=${row.id} tmdb_id=${row.tmdb_id} status=${res.status}`)
    continue
  }

  const data = (await res.json()) as { backdrop_path: string | null }

  if (!data.backdrop_path) {
    console.log(`SKIP id=${row.id} tmdb_id=${row.tmdb_id} no backdrop`)
    continue
  }

  sqlite.run('UPDATE tmdb_media SET backdrop_path = ? WHERE id = ?', [
    data.backdrop_path,
    row.id,
  ])
  console.log(
    `OK id=${row.id} tmdb_id=${row.tmdb_id} backdrop=${data.backdrop_path}`
  )
}

console.log('Done')
