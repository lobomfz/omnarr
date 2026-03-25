# omnarr

Unified media manager.

Search TMDB. Find releases in your indexers. Send the chosen torrent to qBittorrent. Track the download until it finishes.

## Supported today

- TMDB for metadata
- YTS
- Beyond-HD
- qBittorrent

### For humans

Copy and paste this prompt to your LLM agent:

```bash
Install and configure omnarr by following the instructions here:
curl https://raw.githubusercontent.com/lobomfz/omnarr/refs/heads/main/LLMS.md
```

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
omnarr init                         # interactive config wizard

# download flow
omnarr search "The Matrix"          # search TMDB
omnarr releases <search_id>         # browse torrent releases
omnarr download <release_id>        # send to qBittorrent
omnarr status --watch               # monitor progress

# scan and extract flow
omnarr library                      # list media with IDs and status
omnarr scan <media_id>              # probe files, discover tracks
omnarr extract <media_id>           # extract video/audio/subtitle tracks
```

All user-facing IDs are 6-char strings (e.g., `C8R3OD`). The ID shown in `search` is the same one used in `scan` and `extract`.

All commands support `--json`.

## Commands

```bash
# setup
omnarr init
omnarr init --empty

# search and download
omnarr search "Breaking Bad"
omnarr releases ABC123
omnarr download XYZ789
omnarr status
omnarr status --watch --limit 20
omnarr wait-for XYZ789

# library management
omnarr library                       # list all media with status
omnarr scan ABC123                   # probe files on disk
omnarr scan ABC123 --force           # re-probe from scratch
omnarr extract ABC123                # extract tracks (video/audio/subtitle)
```

Requires FFmpeg for `scan` and `extract`.

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
    "tv": "/media/tv",
    "tracks": "/media/tracks"
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
