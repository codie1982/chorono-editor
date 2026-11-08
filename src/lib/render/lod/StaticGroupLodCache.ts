import type { ChronoScene } from '@/lib/types'
import { OffscreenCanvasCache, type OffscreenCanvasCacheOptions } from '../OffscreenCanvasCache'
import { editorResourceBudget } from '@/lib/resources/budget'

/** Shared static-group proxy owner. Adds weak scene identity to the existing
 * admitted LRU cache: project edits/undo/redo and scene switches clear old stores
 * immediately. No strong scene reference survives a frame. The independent
 * local 64 MiB / 256-entry cap includes signatures; composition can additionally
 * supply shared admission. Active borrows survive clearing. Two-second idle expiry releases
 * backing stores while paused. Scratch leases are never retained as proxies. */
export class StaticGroupLodCache extends OffscreenCanvasCache {
  private owner: WeakRef<ChronoScene> | null = null
  constructor(options: OffscreenCanvasCacheOptions = {}) {
    super({ maxBytes: 64 * 1024 ** 2, maxEntries: 256, maxIdleMs: 2000, ...options })
  }

  /** Starts a borrowed source snapshot; materialized animation clones are NOT
   * scene owners. In-place source edits are detected by exact content versions. */
  beginScene(scene: ChronoScene): void {
    if (this.owner?.deref() !== scene) { this.clear(); this.owner = new WeakRef(scene) }
  }
}

export const staticGroupLodCache = new StaticGroupLodCache({ budget: editorResourceBudget })
