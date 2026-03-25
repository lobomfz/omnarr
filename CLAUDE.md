# CLAUDE.md

## What is this

Omnarr is a CLI media manager built with Bun. It uses `@bunli/core` for CLI command structure, SQLite via `@lobomfz/db` (Kysely wrapper) for persistence, and TMDB for media metadata.

## Commands

```bash
bun dev              # Run the CLI
bun test             # Run all tests
bun test tests/db/schema.test.ts  # Run single test file
bun check            # Type-check (tsgo) + lint (oxlint) + duplicate detection (jscpd on changed files)
```

## Architecture

- **CLI entry**: `src/index.ts` creates the CLI via `@bunli/core`, registers commands from `src/commands/`
- **Database**: `src/db/connection.ts` defines the full schema using Arktype types with `@lobomfz/db`. Exports `database` (Database instance), `db` (Kysely instance), and `DB` (inferred type)
- **Db objects**: `src/db/media.ts`, `src/db/downloads.ts`, `src/db/tmdb-media.ts`, `src/db/media-files.ts`, `src/db/media-tracks.ts` — stateless objects grouping query methods per entity
- **Scanner**: `src/scanner.ts` — probes media files on disk via FFmpeg, persists file metadata and track info
- **Extractor**: `src/extractor.ts` — extracts individual tracks (video/audio/subtitle) from media files via FFmpeg `-c copy`
- **Env**: `src/env.ts` validates environment with Arktype, exports `envVariables`

### DB Schema Relations

`tmdb_media` (TMDB cache) ← `media` (user's library) ← `downloads` (active transfers) / `media_files` (files on disk) ← `media_tracks` (streams per file). All cascade-delete from media.

### ID System

All user-facing IDs are 6-char uppercase strings derived via `deriveId()` (polynomial hash → base36). `media.id` uses `deriveId(`${tmdb_id}:${media_type}`)` — same formula as `search_results.id`, so the ID is stable from search through scan/extract.

## Conventions

- Path alias: `@/*` maps to `src/*`
- Formatter: oxfmt (no semicolons, single quotes)
- Linter: oxlint with pedantic/perf/suspicious categories on error
- Tests use `database.reset('table_name')` in `beforeEach` to clear tables (in-memory SQLite)
- Test CLI commands with `testCommand()` and `testCLI()` from `@bunli/test`
