import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

import { $ } from 'bun'

type CpdReport = {
  duplicates?: {
    firstFile: { name: string; start: number; end: number }
    secondFile: { name: string; start: number; end: number }
    lines: number
  }[]
}

const ROOT = resolve(import.meta.dir, '..')

const changedFiles = new Set(
  (
    await $`git diff --name-only --diff-filter=ACMR HEAD && git ls-files --others --exclude-standard`
      .cwd(ROOT)
      .text()
  )
    .trim()
    .split('\n')
    .filter((f) => f.startsWith('src/') && f.endsWith('.ts'))
)

async function runTypes() {
  const result = await $`tsgo`.cwd(ROOT).nothrow()

  if (result.exitCode === 0) {
    console.log('Type check passed.')
  }

  return result.exitCode
}

async function runLint() {
  const result = await $`oxlint src`.cwd(ROOT).nothrow()
  return result.exitCode
}

async function runKnip() {
  const result = await $`bunx knip-bun`.cwd(ROOT).nothrow()
  return result.exitCode
}

async function runCpd() {
  if (changedFiles.size === 0) {
    console.log('[cpd] No changed TS files in src/ — skipping.')
    return 0
  }

  console.log(
    `[cpd] Checking ${changedFiles.size} changed file(s) for duplicates...`
  )

  const outDir = mkdtempSync(join(tmpdir(), 'jscpd-'))

  await $`bunx jscpd --reporters json --output ${outDir}`
    .cwd(ROOT)
    .quiet()
    .nothrow()

  const report = (await Bun.file(
    join(outDir, 'jscpd-report.json')
  ).json()) as CpdReport

  const relevantClones = (report.duplicates ?? []).filter(
    (d) =>
      changedFiles.has(d.firstFile.name) || changedFiles.has(d.secondFile.name)
  )

  if (relevantClones.length === 0) {
    console.log('[cpd] No duplicates found in changed files.')
    return 0
  }

  console.error(
    `\n[cpd] Found ${relevantClones.length} duplicate(s) involving changed files:\n`
  )

  for (const clone of relevantClones) {
    console.error(
      `  ${clone.firstFile.name} [lines ${clone.firstFile.start}-${clone.firstFile.end}]`
    )
    console.error(
      `  ${clone.secondFile.name} [lines ${clone.secondFile.start}-${clone.secondFile.end}]`
    )
    console.error(`  ${clone.lines} lines duplicated\n`)
  }

  return 1
}

const exits = await Promise.all([runTypes(), runLint(), runKnip(), runCpd()])

process.exit(exits.some((code) => code !== 0) ? 1 : 0)
