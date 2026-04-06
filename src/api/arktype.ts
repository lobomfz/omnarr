import { configure } from '@lobomfz/db'

configure({
  onUndeclaredKey: 'delete',
  clone: false,
})
