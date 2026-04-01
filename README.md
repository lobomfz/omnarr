# omnarr

Unified media manager.

Search TMDB. Find releases in your indexers. Download via qBittorrent or rip directly from streaming sources. Scan, play, and manage your library.

## Supported today

- TMDB for metadata
- YTS
- Beyond-HD
- Superflix (direct HLS ripping)
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
omnarr releases <search_id>         # browse releases from all indexers
omnarr download <release_id>        # torrent → qBittorrent, ripper → direct download
omnarr download <release_id> --audio-only  # rip only audio tracks (.mka)
omnarr status --watch               # monitor progress

# library flow
omnarr library                      # list media with IDs and status
omnarr info <media_id>              # detailed view: files, tracks, status
omnarr scan <media_id>              # probe files, discover tracks

# playback
omnarr play <media_id>              # HLS streaming via FFmpeg + mpv
omnarr play <media_id> --video 1 --audio 0  # pick specific tracks
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
omnarr releases ABC123 --season 1     # TV: filter by season
omnarr download XYZ789
omnarr download XYZ789 --audio-only   # ripper: audio tracks only
omnarr status
omnarr status --watch --limit 20
omnarr wait-for XYZ789

# library management
omnarr library                       # list all media with status
omnarr info ABC123                   # files, tracks, download status
omnarr info ABC123 --season 1        # TV: filter by season
omnarr scan ABC123                   # probe files on disk
omnarr scan ABC123 --force           # re-probe from scratch

# playback
omnarr play ABC123                   # HLS stream, auto-selects best tracks
omnarr play ABC123 --video 0 --audio 1
omnarr play ABC123 --season 1 --episode 3  # TV
```

Requires FFmpeg for `scan` and `play`.

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
    },
    { "type": "superflix" }
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
