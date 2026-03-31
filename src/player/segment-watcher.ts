import { watch as fsWatch, type FSWatcher } from 'fs'
import { join } from 'path'

export class SegmentWatcher {
  private sealed = new Set<number>()
  private waiters = new Map<
    number,
    { resolve: () => void; reject: (err: Error) => void }
  >()
  private watcher: FSWatcher | null = null

  constructor(
    private outDir: string,
    private segmentCount: number
  ) {}

  isSealed(index: number) {
    return this.sealed.has(index)
  }

  lastSealed(startFrom: number) {
    let max = startFrom - 1

    for (const index of this.sealed) {
      if (index > max) {
        max = index
      }
    }

    return max
  }

  wait(index: number) {
    if (this.sealed.has(index)) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      this.waiters.set(index, { resolve, reject })
    })
  }

  start(fromIndex: number) {
    this.stop()
    this.sealed.clear()

    this.watcher = fsWatch(this.outDir, (_eventType, filename) => {
      if (!filename?.endsWith('.ts')) {
        return
      }

      const index = this.parseIndex(filename)

      if (index === null || index <= fromIndex) {
        return
      }

      for (let i = fromIndex; i < index; i++) {
        this.seal(i)
      }
    })
  }

  stop() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  reset() {
    this.stop()
    this.rejectAll(new Error('Process killed'))
    this.sealed.clear()
  }

  sealWritten(fromIndex: number) {
    for (let i = fromIndex; i < this.segmentCount; i++) {
      const path = join(this.outDir, segmentFilename(i))

      if (Bun.file(path).size > 0) {
        this.seal(i)
      }
    }
  }

  rejectAll(error: Error) {
    for (const [, waiter] of this.waiters) {
      waiter.reject(error)
    }

    this.waiters.clear()
  }

  private seal(index: number) {
    this.sealed.add(index)

    const waiter = this.waiters.get(index)

    if (waiter) {
      waiter.resolve()
      this.waiters.delete(index)
    }
  }

  private parseIndex(filename: string) {
    const match = filename.match(/^seg_(\d+)\.ts$/)

    if (!match) {
      return null
    }

    return parseInt(match[1], 10)
  }
}

export function segmentFilename(index: number) {
  return `seg_${String(index).padStart(3, '0')}.ts`
}
