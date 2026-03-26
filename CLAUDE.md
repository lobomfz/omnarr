# CLAUDE.md

## What is this

Omnarr is a CLI media manager built with Bun that automates search, download, and processing of media content. Uses `@bunli/core` for CLI commands, SQLite via `@lobomfz/db` (Kysely wrapper) for persistence, and TMDB for metadata.

### User Flow

1. `search "query"` → searches TMDB, caches results with 6-char IDs
2. `releases <id>` → fetches torrents from configured indexers (YTS, Beyond-HD) in parallel
3. `download <id>` → sends torrent to qBittorrent, creates library entry
4. `status --watch` / `wait-for <id>` → monitors progress (sync-on-read with qBittorrent)
5. `scan <id>` → FFmpeg probe on downloaded files, discovers streams (video/audio/subtitle)
6. `extract <id>` → extracts individual tracks via FFmpeg `-c copy` (no re-encode)

### Integrations

- **TMDB** (`src/integrations/tmdb.ts`): metadata lookup, external IDs (IMDB)
- **qBittorrent** (`src/integrations/qbittorrent.ts`): add torrents, status polling
- **Indexers** (`src/integrations/indexers/`): plugin registry — each indexer implements `search()` with Arktype schema for config. Parallel searches, one failure doesn't block others

## Commands

```bash
bun dev              # Run the CLI
bun test             # Run all tests
bun test tests/db/schema.test.ts  # Run single test file
bun check            # Type-check (tsgo) + lint (oxlint) + duplicate detection (jscpd on changed files)
```

## Architecture

- **CLI entry**: `src/index.ts` creates the CLI via `@bunli/core`, registers commands from `src/commands/`
- **Handler**: `src/handler.ts` — orchestrates commands: parses args, dispatches to domain, formats output (JSON or tables)
- **Database**: `src/db/connection.ts` defines the full schema using Arktype types with `@lobomfz/db`. Exports `database` (Database instance), `db` (Kysely instance), and `DB` (inferred type)
- **Db objects**: `src/db/media.ts`, `src/db/downloads.ts`, `src/db/tmdb-media.ts`, `src/db/media-files.ts`, `src/db/media-tracks.ts` — stateless objects grouping query methods per entity
- **Downloads**: `src/downloads.ts` — download lifecycle: creates media + sends torrent, sync-on-read with qBittorrent, stale error cleanup (>24h)
- **Releases**: `src/releases.ts` — fetches torrents from all indexers in parallel, caches by info_hash
- **Scanner**: `src/scanner.ts` — probes media files on disk via FFmpeg, persists file metadata and track info. Reconciles DB with disk (removes stale, adds new)
- **Extractor**: `src/extractor.ts` — extracts individual tracks (video/audio/subtitle) from media files via FFmpeg `-c copy`. Idempotent (already-extracted tracks are skipped)
- **Config**: `src/config.ts` — root folders (movie/tv/tracks), indexers, download client. Validated with Arktype
- **Env**: `src/env.ts` validates environment with Arktype, exports `envVariables`

### DB Schema Relations

`tmdb_media` (TMDB cache) ← `media` (user's library) ← `downloads` (active transfers) / `media_files` (files on disk) ← `media_tracks` (streams per file). All cascade-delete from media.

### ID System

All user-facing IDs are 6-char uppercase strings derived via `deriveId()` (polynomial hash → base36). `media.id` uses `deriveId(`${tmdb_id}:${media_type}`)` — same formula as `search_results.id`, so the ID is stable from search through scan/extract.

### Key Patterns

- **Sync-on-read**: downloads don't poll in background — they sync with qBittorrent when the user queries (`status`, `wait-for`, `library`)
- **Indexers as plugins**: registry with Arktype schema per indexer, parallel searches, isolated failures
- **Idempotent extraction**: tracks with `path` already set are skipped on re-extract

### FFmpeg

All FFmpeg/ffprobe operations must go through `@lobomfz/ffmpeg` (`FFmpegBuilder`). Never spawn `ffmpeg` or `ffprobe` directly via `Bun.spawn`, `child_process`, or any other execution method. If the builder doesn't support an operation, add it to the library first.

## Conventions

- Path alias: `@/*` maps to `src/*`
- Formatter: oxfmt (no semicolons, single quotes)
- Linter: oxlint with pedantic/perf/suspicious categories on error
- Tests use `database.reset('table_name')` in `beforeEach` to clear tables (in-memory SQLite)
- Test CLI commands with `testCommand()` and `testCLI()` from `@bunli/test`
