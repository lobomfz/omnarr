export function get(component: string, filters?: Record<string, string>) {
  const selector = buildSelector(component, filters)
  const els = document.querySelectorAll(selector)

  if (els.length === 0) {
    throw new Error(`get: no element found for ${selector}`)
  }

  if (els.length > 1) {
    throw new Error(
      `get: found ${els.length} elements for ${selector}, expected 1`
    )
  }

  return els[0] as HTMLElement
}

export function query(component: string, filters?: Record<string, string>) {
  const selector = buildSelector(component, filters)
  const els = document.querySelectorAll(selector)

  if (els.length > 1) {
    throw new Error(
      `query: found ${els.length} elements for ${selector}, expected 0 or 1`
    )
  }

  if (els.length === 0) {
    return null
  }

  return els[0] as HTMLElement
}

export function slot(parent: HTMLElement, name: string) {
  const el = parent.querySelector(`[data-slot="${name}"]`)

  if (!el) {
    const component = parent.dataset.component ?? 'unknown'
    throw new Error(`slot: no slot "${name}" found in component "${component}"`)
  }

  return el as HTMLElement
}

function buildSelector(component: string, filters?: Record<string, string>) {
  let selector = `[data-component="${component}"]`

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      selector += `[data-${key}="${value}"]`
    }
  }

  return selector
}
