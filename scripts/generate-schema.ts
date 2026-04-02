import { configJsonSchema } from '@/lib/config'

await Bun.write(
  'config.schema.json',
  JSON.stringify(configJsonSchema, null, 2) + '\n',
)

console.log('Generated config.schema.json')
