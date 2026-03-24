# omnarr

Unified media manager.

Search TMDB. Find releases in your indexers. Send the chosen torrent to qBittorrent. Track the download until it finishes.

## Supported today

- TMDB for metadata
- YTS
- Beyond-HD
- qBittorrent

### For LLM Agents

Fetch the installation guide and follow it:

```bash
curl -fsSL https://raw.githubusercontent.com/lobomfz/omnarr/refs/heads/main/LLMS.md
```

## Manual install

```bash
bun i -g omnarr
```

## Quick start

```bash
omnarr init
omnarr search "The Matrix"
omnarr releases <search_id>
omnarr download <release_id>
omnarr status
omnarr status --watch
omnarr wait-for <release_id>
```

All commands support `--json`.

## Commands

```bash
omnarr init
omnarr init --empty
omnarr search "Breaking Bad"
omnarr search "Breaking Bad" --json
omnarr releases abc123
omnarr download def456
omnarr status
omnarr status --watch
omnarr status --limit 20
omnarr wait-for def456
```

## Config

By default:

- config: `~/.config/omnarr/config.json`
- database: `~/.local/share/omnarr/db.sqlite`

Example config:

```json
{
  "$schema": "./schema.json",
  "root_folders": {
    "movie": "/media/movies",
    "tv": "/media/tv"
  },
  "indexers": [
    { "type": "yts" },
    {
      "type": "beyond-hd",
      "api_key": "your-api-key",
      "rss_key": "your-rss-key"
    }
  ],
  "download_client": {
    "type": "qbittorrent",
    "url": "http://localhost:8080",
    "username": "admin",
    "password": "secret",
    "category": "omnarr"
  }
}
```
