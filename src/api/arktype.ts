import { configure } from 'arktype/config'

configure({
  onUndeclaredKey: 'delete',
  clone: false,
  exactOptionalPropertyTypes: false,
})
