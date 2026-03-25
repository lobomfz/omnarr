#!/usr/bin/env bun
import { createCLI } from '@bunli/core'

import { DownloadCommand } from '@/commands/download'
import { ExtractCommand } from '@/commands/extract'
import { InitCommand } from '@/commands/init'
import { ReleasesCommand } from '@/commands/releases'
import { ScanCommand } from '@/commands/scan'
import { SearchCommand } from '@/commands/search'
import { StatusCommand } from '@/commands/status'
import { WaitForCommand } from '@/commands/wait-for'

const cli = await createCLI({
  name: 'omnarr',
  version: '0.1.0',
  description:
    'CLI media manager\n\nAll commands support --json for machine-readable output.',
})

cli.command(InitCommand)
cli.command(ScanCommand)
cli.command(ExtractCommand)
cli.command(SearchCommand)
cli.command(ReleasesCommand)
cli.command(DownloadCommand)
cli.command(StatusCommand)
cli.command(WaitForCommand)

await cli.run()
