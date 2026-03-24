import { chmod, rm } from 'fs/promises'

await rm('dist', { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: ['src/index.ts'],
  outdir: 'dist',
  naming: 'omnarr',
  target: 'bun',
  minify: true,
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

for (const output of result.outputs) {
  if (output.path.endsWith('/omnarr')) {
    continue
  }

  await rm(output.path)
}

await chmod('dist/omnarr', 0o755)
