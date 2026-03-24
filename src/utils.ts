export function deriveId(input: string) {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(31, h) + input.codePointAt(i)!
  }
  return Math.abs(h).toString(36).padStart(6, '0').slice(0, 6).toUpperCase()
}
