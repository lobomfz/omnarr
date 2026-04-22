import type { scan_progress_step } from '@/db/connection'

export type ScanFileProgressLatest = {
  current_step?: scan_progress_step
  ratio: number
}
