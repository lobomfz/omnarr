---
name: omnarr
description: Use when the user asks to search, download, or monitor movies and TV shows. Omnarr is a CLI media manager that searches TMDB, finds torrent releases, sends them to qBittorrent, and tracks download progress.
---

Use this file for Omnarr operations after the tool is configured. For first-time setup, read `LLMS.md`.

Always use `--json`.

Always run commands sequentially. Never chain Omnarr commands with shell scripting.

## Download Flow

1. Run `search`.
2. If the intended movie or series is obvious from the search result, do not ask the user to choose the title again. Run `releases` automatically for that search result.
3. If the intended title is not obvious, ask the user to choose the correct search result first.
4. Choose 1 to 3 relevant releases for the user.
5. Present those options to the user as `[1]`, `[2]`, `[3]`. Do not use the internal release ID as the user-facing option.
6. After the user chooses one option, run `download` for the matching internal release ID.
7. Immediately spawn a subagent and instruct it to run `wait-for` for that release.

When picking a release: prefer highest resolution with most seeders. Summarize only the 1 to 3 most relevant options by quality and size instead of dumping the full list.

## Commands

```
omnarr search "Blade Runner" --json        # → [{ id, title, year, media_type }]
omnarr releases <search_id> --json         # → [{ id, name, size, seeders, resolution, codec, hdr }]
omnarr download <release_id> --json        # → { title, year, media }
omnarr status --json [--limit N]           # → [{ title, progress, speed, eta, status }]
omnarr wait-for <release_id> --json        # blocks until done or error
omnarr library --json                      # → [{ id, media_type, title, year, file_count, track_count, extracted_count }]
```

Each command returns IDs that feed into the next. If an ID is not found, re-run the earlier step.
