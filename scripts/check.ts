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
  const result = await $`oxlint --fix`.cwd(ROOT).quiet().nothrow()

  if (result.exitCode !== 0) {
    process.stderr.write(result.stderr)
  }

  return result.exitCode
}

async function runKnip() {
  const result = await $`bunx knip-bun`.cwd(ROOT).nothrow()
  return result.exitCode
}

async function runCpd() {
  if (changedFiles.size === 0) {
    return 0
  }
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

const TEST_LOG = '/tmp/omnarr-test-result.log'

async function runTests() {
  const result = await $`bun test`
    .env({ ...Bun.env, AGENT: '1' })
    .cwd(ROOT)
    .quiet()
    .nothrow()

  const output = result.stdout.toString() + result.stderr.toString()
  await Bun.write(TEST_LOG, output)

  if (result.exitCode === 0) {
    console.log('All tests passed.')
  } else {
    console.error(`Some tests failed — check log at ${TEST_LOG}`)
  }

  return result.exitCode
}

const exits = await Promise.all([
  runTypes(),
  runLint(),
  runKnip(),
  runCpd(),
  runTests(),
])

process.exit(exits.some((code) => code !== 0) ? 1 : 0)
