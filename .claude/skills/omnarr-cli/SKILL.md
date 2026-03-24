---
name: omnarr-cli
description: Use when the user asks to search, download, or monitor movies and TV shows. Omnarr is a CLI media manager that searches TMDB, finds torrent releases, sends them to qBittorrent, and tracks download progress.
---

Always use `--json`. Flow: `search` → `releases` → `download` → `status` / `wait-for`.

```
omnarr search "Blade Runner" --json        # → [{ id, title, year, media_type }]
omnarr releases <search_id> --json         # → [{ id, name, size, seeders, resolution, codec, hdr }]
omnarr download <release_id> --json        # → { title, year, media }
omnarr status --json [--limit N]           # → [{ title, progress, speed, eta, status }]
omnarr wait-for <release_id> --json        # blocks until done or error
```

Each command returns IDs that feed into the next. If an ID is not found, re-run the earlier step.

When picking a release: prefer highest resolution with most seeders. Summarize top options by quality/size instead of dumping the full list.

## Setup

`omnarr init --empty` creates the config file at `~/.config/omnarr/config.json` with the JSON schema. Edit the file directly to configure:

```json
{
  "$schema": "./schema.json",
  "root_folders": { "movie": "/media/movies", "tv": "/media/tv" },
  "indexers": [
    { "type": "yts" },
    { "type": "beyond-hd", "api_key": "...", "rss_key": "..." }
  ],
  "download_client": {
    "type": "qbittorrent",
    "url": "http://localhost:8080",
    "username": "admin",
    "password": "..."
  }
}
```

At minimum, one root folder and one indexer are needed to search and download. The download client is optional but required to actually send torrents.
