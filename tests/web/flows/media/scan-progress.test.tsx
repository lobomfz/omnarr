import '../../setup-dom'
import { afterEach, describe, expect, test } from 'bun:test'

import { ScanProgress } from '@/web/routes/media.$id/-components/downloads-section/scan-progress'

import { get, slot } from '../../dom'
import { cleanup, render } from '../../testing-library'

afterEach(() => {
  cleanup()
})

const progress = { current: 1, total: 3, path: '/downloads/movie.mkv' }

describe('ScanProgress', () => {
  test('renders with data-component="scan-progress"', () => {
    render(<ScanProgress progress={progress} />)

    const el = get('scan-progress')

    expect(el).toBeDefined()
  })

  test('data-current-step and data-ratio absent when no fileProgress', () => {
    render(<ScanProgress progress={progress} />)

    const el = get('scan-progress')

    expect(el.dataset.currentStep).toBeUndefined()
    expect(el.dataset.ratio).toBeUndefined()
  })

  test('shows file progress bar and attributes when current_step=keyframes', () => {
    render(
      <ScanProgress
        progress={progress}
        fileProgress={{ current_step: 'keyframes', ratio: 0.65 }}
      />
    )

    const el = get('scan-progress', {
      'current-step': 'keyframes',
      ratio: '0.65',
    })

    expect(slot(el, 'file-bar').dataset.ratio).toBe('0.65')
  })

  test('shows file progress bar when current_step=vad', () => {
    render(
      <ScanProgress
        progress={progress}
        fileProgress={{ current_step: 'vad', ratio: 0.42 }}
      />
    )

    expect(slot(get('scan-progress'), 'file-bar').dataset.ratio).toBe('0.42')
  })

  test('file bar carries raw ratio for 0.999', () => {
    render(
      <ScanProgress
        progress={progress}
        fileProgress={{ current_step: 'keyframes', ratio: 0.999 }}
      />
    )

    expect(slot(get('scan-progress'), 'file-bar').dataset.ratio).toBe('0.999')
  })

  test('file bar carries raw ratio for 0.001', () => {
    render(
      <ScanProgress
        progress={progress}
        fileProgress={{ current_step: 'keyframes', ratio: 0.001 }}
      />
    )

    expect(slot(get('scan-progress'), 'file-bar').dataset.ratio).toBe('0.001')
  })

  test('renders without current_step when fileProgress has no step', () => {
    render(<ScanProgress progress={progress} fileProgress={{ ratio: 0.42 }} />)

    const el = get('scan-progress', { ratio: '0.42' })

    expect(el.dataset.currentStep).toBeUndefined()
    expect(slot(el, 'file-bar').dataset.ratio).toBe('0.42')
  })
})
