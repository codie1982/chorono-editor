import type { ChronoScene } from '@/lib/types'
import type { PaintStatistics } from '@/lib/render/visibility/PaintFrame'

/** Latest viewport-frame counters only, with a weak identity guard. Exports,
 * ghost passes and old projects cannot replace the current panel's sample.
 * No timer, frame history, canvas or strong scene reference is retained. */
export class PaintWorkMonitor {
  private scene: WeakRef<ChronoScene> | null = null
  private latest: (PaintStatistics & { sampledAt: number }) | null = null

  /** Publish a detached main-frame result, including partial failed renders. */
  record(scene: ChronoScene, statistics: PaintStatistics | null): void {
    this.scene = new WeakRef(scene)
    this.latest = statistics ? { ...statistics, sampledAt: Date.now() } : null
  }

  /** Returns unavailable until this exact scene identity has been rendered. */
  getSnapshot(scene: ChronoScene) {
    return this.scene?.deref() === scene && this.latest ? { ...this.latest } : null
  }
}

export const paintWorkMonitor = new PaintWorkMonitor()
