import '../../setup-dom'
import { afterEach, describe, expect, test } from 'bun:test'

import {
  ReleaseRow,
  type ReleaseSummary,
} from '@/web/routes/media.$id/-components/library-overview'

import { get } from '../../dom'
import { cleanup, render } from '../../testing-library'

afterEach(() => cleanup())

const baseSummary: ReleaseSummary = {
  id: 1,
  name: 'movie.mkv',
  state: 'ready',
  indexer: null,
  role: 'full release',
  fileCount: 3,
  scannedFileCount: 3,
  sizeBytes: 0,
  downloadProgress: 1,
  scanProgress: 1,
  speed: 0,
  errorAt: null,
  tracks: [],
  scanningFileIds: new Set(),
  scanDetail: null,
  downloadDetail: null,
  error: null,
}

const selection = {
  video: undefined,
  audio: undefined,
  subtitle: undefined,
  select: () => {},
}

function renderRow(release: ReleaseSummary) {
  render(
    <ReleaseRow
      release={release}
      expanded={false}
      onToggle={() => {}}
      isLast
      selection={selection}
    />
  )

  return get('library-release-row', { 'release-id': String(release.id) })
}

describe('ReleaseRow scan progress', () => {
  test('publishes data-state="ready" and full progress when complete', () => {
    const el = renderRow(baseSummary)

    expect(el.dataset.state).toBe('ready')
    expect(el.dataset.downloadProgress).toBe('1')
    expect(el.dataset.scanProgress).toBe('1')
    expect(el.dataset.scanStep).toBeUndefined()
  })

  test('publishes data-state="downloading" with raw progress', () => {
    const el = renderRow({
      ...baseSummary,
      state: 'downloading',
      downloadProgress: 0.42,
      scanProgress: 0,
    })

    expect(el.dataset.state).toBe('downloading')
    expect(el.dataset.downloadProgress).toBe('0.42')
    expect(el.dataset.scanProgress).toBe('0')
  })

  test('publishes data-state="scanning" with raw scan ratio', () => {
    const el = renderRow({
      ...baseSummary,
      state: 'scanning',
      scannedFileCount: 2,
      downloadProgress: 1,
      scanProgress: 0.65,
      scanDetail: { current: 2, total: 3 },
    })

    expect(el.dataset.state).toBe('scanning')
    expect(el.dataset.scanProgress).toBe('0.65')
    expect(el.dataset.scanStep).toBeUndefined()
  })

  test('publishes data-scan-step when scanDetail has step', () => {
    const el = renderRow({
      ...baseSummary,
      state: 'scanning',
      scanProgress: 0.33,
      scanDetail: { current: 1, total: 3, step: 'ep1.mkv' },
    })

    expect(el.dataset.scanStep).toBe('ep1.mkv')
  })

  test('scan progress carries raw ratio for 0.999', () => {
    const el = renderRow({
      ...baseSummary,
      state: 'scanning',
      scanProgress: 0.999,
      scanDetail: { current: 2, total: 3 },
    })

    expect(el.dataset.scanProgress).toBe('0.999')
  })

  test('scan progress carries raw ratio for 0.001', () => {
    const el = renderRow({
      ...baseSummary,
      state: 'scanning',
      scanProgress: 0.001,
      scanDetail: { current: 0, total: 3 },
    })

    expect(el.dataset.scanProgress).toBe('0.001')
  })

  test('publishes data-state="error" with error field', () => {
    const el = renderRow({
      ...baseSummary,
      state: 'error',
      downloadProgress: 0.2,
      error: 'Download failed',
    })

    expect(el.dataset.state).toBe('error')
  })

  test('publishes data-state="queued" when scan not started', () => {
    const el = renderRow({
      ...baseSummary,
      state: 'queued',
      scannedFileCount: 0,
      scanProgress: 0,
    })

    expect(el.dataset.state).toBe('queued')
    expect(el.dataset.scanProgress).toBe('0')
  })
})
