import { type Type } from 'arktype'

export function extractSchemaProps(schema: Type) {
  const props: { key: string; required: boolean }[] =
    (schema as any).structure?.props ?? []

  return {
    keys: props.map((p) => p.key),
    required: new Set(props.filter((p) => p.required).map((p) => p.key)),
  }
}

export function deriveId(input: string) {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(31, h) + input.codePointAt(i)!
  }
  return Math.abs(h).toString(36).padStart(6, '0').slice(0, 6).toUpperCase()
}
