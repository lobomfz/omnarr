import type { scan_progress_step } from '@/db/connection'

export const SCAN_PROGRESS_STEP_LABEL = {
  keyframes: 'Keyframes',
  vad: 'Voice detection',
} satisfies Record<scan_progress_step, string>

export type ScanFileProgressLatest = {
  current_step?: scan_progress_step
  ratio: number
}

export const SCAN_PENDING_TIMEOUT = 10_000

export const SCAN_ERROR_DISPLAY = 3_000
