#!/usr/bin/env bun
import { createCLI } from '@bunli/core'

import { DownloadCommand } from '@/commands/download'
import { InfoCommand } from '@/commands/info'
import { InitCommand } from '@/commands/init'
import { LibraryCommand } from '@/commands/library'
import { PlayCommand } from '@/commands/play'
import { ReleasesCommand } from '@/commands/releases'
import { ScanCommand } from '@/commands/scan'
import { SearchCommand } from '@/commands/search'
import { StatusCommand } from '@/commands/status'
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
cli.command(StatusCommand)
cli.command(WaitForCommand)

await cli.run()
