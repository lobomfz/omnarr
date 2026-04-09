import { get, slot } from '../../dom'
import type { mountApp } from '../../mount-app'

export async function typeSearch(
  user: ReturnType<typeof mountApp>['user'],
  text: string
) {
  await user.type(slot(get('search-page'), 'input'), text)
}
