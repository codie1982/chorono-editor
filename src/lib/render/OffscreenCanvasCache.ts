// ── OffscreenCanvasCache ──────────────────────────────────────────────────────
//
// Reusable offscreen canvas pool keyed by `key + version`. Used by:
//   - GroupRenderer (precompose group contents)            [Sprint 6]
//   - MaskRenderer  (render mask + content separately)     [Sprint 6]
//   - Effect chain  (each effect output is one offscreen)  [Sprint 8]
//
// Lifecycle:
//   1. Renderer asks for `get(key, version)`.
//      → cache hit  : returns the canvas, marks lastUsed
//      → cache miss : returns null, renderer renders fresh and calls set()
//   2. set() inserts and evicts LRU if memory budget exceeded
//   3. invalidate(key) on layer mutation — clears all versions of that key
//
// Memory accounting: width * height * 4 (RGBA). Default budget 64 MB.
//
// SKELETON: V1 ships with the API only — actual consumers wire it up in
// Sprint 6 (groups/masks) and Sprint 8 (effects). Plain HTMLCanvasElement
// is used here for broad compatibility; switch to OffscreenCanvas later if
// renderer moves to a worker.

interface CacheEntry {
  canvas:   HTMLCanvasElement
  version:  number
  lastUsed: number   // ms epoch
  bytes:    number   // for memory accounting
}

export interface OffscreenCanvasCacheOptions {
  /** Hard memory cap in bytes. Default 64 MB. */
  maxBytes?: number
}

export class OffscreenCanvasCache {
  private cache    = new Map<string, CacheEntry>()
  private maxBytes: number
  private usedBytes = 0
  private counter   = 0   // monotonic clock for LRU

  constructor(options: OffscreenCanvasCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024
  }

  /**
   * Returns a cached canvas if `key` is present AND its stored version matches.
   * Stale entries (wrong version) are removed and null is returned so the
   * caller can render fresh.
   */
  get(key: string, version: number): HTMLCanvasElement | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (entry.version !== version) {
      this.evict(key)
      return null
    }
    entry.lastUsed = ++this.counter
    return entry.canvas
  }

  /**
   * Stores a canvas under (key, version). Evicts the previous entry for the
   * same key. Triggers LRU eviction if the memory budget is exceeded.
   */
  set(key: string, version: number, canvas: HTMLCanvasElement): void {
    if (this.cache.has(key)) this.evict(key)

    const bytes = canvas.width * canvas.height * 4
    this.cache.set(key, {
      canvas,
      version,
      lastUsed: ++this.counter,
      bytes,
    })
    this.usedBytes += bytes

    if (this.usedBytes > this.maxBytes) this.evictLRU()
  }

  /** Drops every entry under `key`, regardless of version. */
  invalidate(key: string): void {
    this.evict(key)
  }

  /** Drops everything — useful between scene loads or in tests. */
  clear(): void {
    this.cache.clear()
    this.usedBytes = 0
  }

  /** Current memory pressure in bytes. */
  size(): number {
    return this.usedBytes
  }

  count(): number {
    return this.cache.size
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private evict(key: string): void {
    const e = this.cache.get(key)
    if (!e) return
    this.cache.delete(key)
    this.usedBytes -= e.bytes
  }

  private evictLRU(): void {
    // Keep evicting the oldest entry until we're under budget.
    while (this.usedBytes > this.maxBytes && this.cache.size > 0) {
      let oldestKey: string | null = null
      let oldestUsed = Infinity
      this.cache.forEach((entry, key) => {
        if (entry.lastUsed < oldestUsed) {
          oldestUsed = entry.lastUsed
          oldestKey  = key
        }
      })
      if (oldestKey === null) break
      this.evict(oldestKey)
    }
  }
}

/**
 * Helper: allocates a new offscreen-friendly canvas at the given size.
 * Uses OffscreenCanvas when available, falls back to a detached <canvas>.
 */
export function createOffscreen(width: number, height: number): HTMLCanvasElement {
  // OffscreenCanvas would be ideal but isn't widely supported in 2D-context
  // workflows where it's later composited back. For V1 we stick with the
  // detached canvas approach — same memory footprint, simpler ctx access.
  const c = typeof document !== 'undefined'
    ? document.createElement('canvas')
    // SSR / test environment fallback: minimal stub satisfying HTMLCanvasElement subset
    : ({ width: 0, height: 0 } as unknown as HTMLCanvasElement)
  c.width  = width
  c.height = height
  return c
}
