#!/usr/bin/env bun
process.on('SIGINT', () => process.exit(0))

import { createCLI } from '@bunli/core'

import { formatRpcError } from '@/cli/rpc-error'

import { DownloadCommand } from '@/commands/download'
import { ExportCommand } from '@/commands/export'
import { InfoCommand } from '@/commands/info'
import { InitCommand } from '@/commands/init'
import { LibraryCommand } from '@/commands/library'
import { PlayCommand } from '@/commands/play'
import { ReleasesCommand } from '@/commands/releases'
import { ScanCommand } from '@/commands/scan'
import { SearchCommand } from '@/commands/search'
import { StatusCommand } from '@/commands/status'
import { SubtitlesCommand } from '@/commands/subtitles'
import { WaitForCommand } from '@/commands/wait-for'

import pkg from '../package.json'

const cli = await createCLI({
  name: 'omnarr',
  version: pkg.version,
  description:
    'CLI media manager\n\nAll commands support --json for machine-readable output.',
})

cli.command(InitCommand)
cli.command(InfoCommand)
cli.command(LibraryCommand)
cli.command(PlayCommand)
cli.command(ScanCommand)
cli.command(SearchCommand)
cli.command(ReleasesCommand)
cli.command(DownloadCommand)
cli.command(ExportCommand)
cli.command(StatusCommand)
cli.command(SubtitlesCommand)
cli.command(WaitForCommand)

await cli.run().catch((error) => {
  console.error(formatRpcError(error).message)
  process.exit(1)
})
