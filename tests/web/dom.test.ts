import './setup-dom'
import { afterEach, describe, expect, test } from 'bun:test'

import { get, query, slot } from './dom'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('get', () => {
  test('returns the matching element for a simple selector', () => {
    document.body.innerHTML =
      '<div data-component="download-pill" data-count="2"></div>'

    const el = get('download-pill')

    expect(el.dataset.count).toBe('2')
  })

  test('throws with error message including full selector when zero matches', () => {
    document.body.innerHTML = '<div data-component="other"></div>'

    expect(() => get('download-pill')).toThrow(
      '[data-component="download-pill"]'
    )
  })

  test('throws when more than one match is found', () => {
    document.body.innerHTML = `
      <div data-component="pill-entry"></div>
      <div data-component="pill-entry"></div>
    `

    expect(() => get('pill-entry')).toThrow()
  })

  test('composes filter attributes into the selector', () => {
    document.body.innerHTML = `
      <div data-component="pill-entry" data-download-id="1" data-media-id="ABC"></div>
      <div data-component="pill-entry" data-download-id="2" data-media-id="DEF"></div>
    `

    const el = get('pill-entry', { 'download-id': '2' })

    expect(el.dataset.mediaId).toBe('DEF')
  })
})

describe('query', () => {
  test('returns the matching element when exactly one is found', () => {
    document.body.innerHTML =
      '<div data-component="toast" data-code="DOWNLOAD_STARTED"></div>'

    const el = query('toast')

    expect(el).not.toBeNull()
    expect(el!.dataset.code).toBe('DOWNLOAD_STARTED')
  })

  test('returns null when zero matches are found', () => {
    document.body.innerHTML = '<div data-component="other"></div>'

    expect(query('download-pill')).toBeNull()
  })

  test('throws when more than one match is found', () => {
    document.body.innerHTML = `
      <div data-component="pill-entry"></div>
      <div data-component="pill-entry"></div>
    `

    expect(() => query('pill-entry')).toThrow()
  })
})

describe('slot', () => {
  test('returns the matching slot within the given parent', () => {
    document.body.innerHTML = `
      <div data-component="action-bar">
        <button data-slot="download">Go</button>
      </div>
    `

    const parent = get('action-bar')
    const btn = slot(parent, 'download')

    expect(btn.textContent).toBe('Go')
  })

  test('throws with error naming the parent component when slot is missing', () => {
    document.body.innerHTML = '<div data-component="action-bar"></div>'

    const parent = get('action-bar')

    expect(() => slot(parent, 'download')).toThrow('action-bar')
  })

  test('does not match slots outside the given parent', () => {
    document.body.innerHTML = `
      <div data-component="action-bar" id="first"></div>
      <div data-component="release-row">
        <button data-slot="download">Other</button>
      </div>
    `

    const parent = get('action-bar')

    expect(() => slot(parent, 'download')).toThrow()
  })
})
