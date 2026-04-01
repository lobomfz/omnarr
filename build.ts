import { chmod, cp, rm } from 'fs/promises'

await rm('dist', { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: ['src/index.ts'],
  outdir: 'dist',
  naming: 'omnarr',
  target: 'bun',
  minify: true,
  external: ['onnxruntime-node'],
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

await cp('src/models', 'dist/models', { recursive: true })
await chmod('dist/omnarr', 0o755)
