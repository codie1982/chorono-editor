import { canvasMemoryTracker } from '@/lib/resources/memory/CanvasMemoryTracker'
import type { ResourceAllocator, ResourceReservation } from '@/lib/resources/budget'

type CacheVersion = number | string
interface CacheEntry {
  canvas: HTMLCanvasElement
  version: CacheVersion
  bytes: number
  pixelBytes: number
  lastUsed: number
  owned: boolean
  lost?: () => void
  reservation?: ResourceReservation
  pins: number
}
export interface OffscreenCanvasCacheOptions {
  /** Retained + pending bytes; owned entries include UTF-16 key/version estimates. */
  maxBytes?: number
  maxEntries?: number
  /** Zero disables expiry for legacy borrowed set(). LOD supplies its own grace. */
  maxIdleMs?: number
  createCanvas?: (width: number, height: number) => HTMLCanvasElement
  now?: () => number
  /** Optional shared admission for OWNED stores; legacy set() remains borrowed
   * and cannot preflight or take ownership of an existing external allocation. */
  budget?: ResourceAllocator
}

/** Versioned LRU canvas cache. Legacy set() borrows an already allocated canvas;
 * new getOrCreate() owns its output and admits bytes BEFORE allocation. Owned
 * eviction/invalidation/expiry shrinks backing stores; borrowed legacy outputs
 * remain untouched. No source scene, layer or draw callback is retained.
 * A pending creation is reserved but never evicted/reused; reentrant clear()
 * cancels its commit. Counters are cumulative, snapshots detached, one idle timer.
 * Shared admission is optional; composition injects it for editor-owned caches.
 * acquire() pins a result across local/global pressure and clear. Invalidated
 * pinned entries retire and remain charged until their last lease is released.
 * Legacy get/getOrCreate results are borrowed only until the next mutation;
 * new consumers that allocate or retain a result must use acquire/finally.
 */
export class OffscreenCanvasCache {
  private cache = new Map<string, CacheEntry>()
  private usedBytes = 0
  private pendingBytes = 0
  private pendingEntries = 0
  private retired = new Set<CacheEntry>()
  private generation = 0
  private timer?: ReturnType<typeof setTimeout>
  private peakBytes = 0
  private hits = 0
  private misses = 0
  private allocations = 0
  private evictions = 0
  private denials = 0
  private failures = 0
  private readonly maxBytes: number
  private readonly maxEntries: number
  private readonly maxIdleMs: number
  private readonly allocate: NonNullable<OffscreenCanvasCacheOptions['createCanvas']>
  private readonly now: () => number
  private readonly budget?: ResourceAllocator

  /** Creates no canvases or timers until the first admitted owned entry. */
  constructor(options: OffscreenCanvasCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? 64 * 1024 ** 2
    this.maxEntries = options.maxEntries ?? 256
    this.maxIdleMs = options.maxIdleMs ?? 0
    if (![this.maxBytes, this.maxEntries, this.maxIdleMs].every(Number.isSafeInteger)
      || this.maxBytes < 0 || this.maxEntries < 1 || this.maxIdleMs < 0 || this.maxIdleMs > 2147483647) {
      throw new RangeError('Invalid canvas cache budget/capacity/idle duration.')
    }
    this.allocate = options.createCanvas ?? createOffscreen
    this.now = options.now ?? (() => performance.now())
    this.budget = options.budget
  }

  /** Exact versions only; stale entries are released. Hits refresh LRU and idle age. */
  get(key: string, version: CacheVersion): HTMLCanvasElement | null {
    const entry = this.cache.get(key)
    if (!entry || entry.version !== version) {
      if (entry) this.evict(key)
      this.misses++; return null
    }
    this.cache.delete(key); this.cache.set(key, entry)
    entry.lastUsed = this.now(); this.hits++
    entry.reservation?.touch()
    return entry.canvas
  }

  /** Membership only, without extending lifetime; used for LOD hysteresis. */
  has(key: string): boolean { return this.cache.has(key) }

  /** Legacy borrowed insertion: caller retains backing-store ownership.
   * This cannot preflight an allocation that already occurred; use getOrCreate
   * for new budget-controlled consumers. Replacement keeps old API semantics. */
  set(key: string, version: CacheVersion, canvas: HTMLCanvasElement): void {
    this.evict(key)
    const bytes = canvas.width * canvas.height * 4
    this.cache.set(key, { canvas, version, bytes, pixelBytes: bytes, lastUsed: this.now(), owned: false, pins: 0 })
    this.usedBytes += bytes
    this.makeRoom(0, 0)
  }

  /** Returns a borrowed cached result, or builds an admitted private canvas.
   * Denial/allocation/context failure returns null for live-vector fallback.
   * Painter exceptions propagate after release. Width/height are integer pixels;
   * string versions are counted at two bytes/code unit, bounded by this budget.
   * allowCreate=false permits hits but defers a miss before allocation (e.g.
   * insufficient render-work budget). Caller consumes synchronously; no resize/retain. */
  getOrCreate(key: string, version: CacheVersion, width: number, height: number,
    paint: (context: CanvasRenderingContext2D) => void, allowCreate = true): { canvas: HTMLCanvasElement; created: boolean } | null {
    const hit = this.get(key, version)
    if (hit && hit.width === width && hit.height === height) return { canvas: hit, created: false }
    if (hit) { this.evict(key); this.hits--; this.misses++ }
    if (!allowCreate) return null
    const pixelBytes = width * height * 4
    const bytes = pixelBytes + key.length * 2 + (typeof version === 'string' ? version.length * 2 : 8)
    if (![width, height, bytes].every(Number.isSafeInteger) || width <= 0 || height <= 0
      || width > 16384 || height > 16384 || bytes + this.pendingBytes > this.maxBytes) {
      this.denials++; return null
    }
    if (!this.makeRoom(bytes, 1)) { this.denials++; return null }
    const generation = this.generation
    const reservation = this.budget?.reserve('preview', bytes)
    if (this.budget && !reservation) { this.denials++; return null }
    if (generation !== this.generation) { reservation?.release(); return null }
    this.pendingBytes += bytes; this.pendingEntries++
    this.peakBytes = Math.max(this.peakBytes, this.usedBytes + this.pendingBytes)
    let canvas: HTMLCanvasElement | undefined, committed = false
    try {
      let context: CanvasRenderingContext2D | null
      try {
        canvas = this.allocate(width, height)
        context = canvas.getContext('2d')
        if (!context || context.isContextLost?.()) throw new Error('Canvas2D unavailable')
        canvasMemoryTracker.track(canvas)
        this.allocations++
      } catch { this.failures++; return null }
      paint(context)
      if (generation !== this.generation) return null
      this.evict(key)
      if (!this.makeRoom(0, 0)) { this.denials++; return null }
      const lost = () => this.invalidate(key)
      canvas.addEventListener?.('contextlost', lost)
      reservation?.commit()
      const entry = { canvas, version, bytes, pixelBytes, lastUsed: this.now(), owned: true, lost, pins: 0, reservation: reservation ?? undefined }
      this.cache.set(key, entry)
      this.usedBytes += bytes; committed = true; this.scheduleExpiry()
      this.allowSharedReclaim(key, entry)
      return { canvas, created: true }
    } finally {
      this.pendingBytes -= bytes; this.pendingEntries--
      if (!committed) { if (canvas) canvas.width = canvas.height = 0; reservation?.release() }
    }
  }

  /** Pin an owned result until explicit idempotent release. Global/local pressure,
   * invalidation and clear never shrink a pinned store. An invalidated pinned
   * entry becomes retired and remains charged until its final borrower releases.
   * Painter behavior/fallback matches getOrCreate; consume in try/finally. */
  acquire(key: string, version: CacheVersion, width: number, height: number,
    paint: (context: CanvasRenderingContext2D) => void, allowCreate = true): { canvas: HTMLCanvasElement; created: boolean; release(): void } | null {
    const result = this.getOrCreate(key, version, width, height, paint, allowCreate)
    const entry = this.cache.get(key)
    if (!result || !entry || entry.canvas !== result.canvas) return null
    entry.pins++; entry.reservation?.protect()
    let released = false
    return { ...result, release: () => {
      if (released) return
      released = true; entry.pins--
      if (entry.pins === 0) {
        if (this.retired.has(entry)) this.destroy(entry)
        else this.allowSharedReclaim(key, entry)
      }
    } }
  }

  /** Drops an owned backing store immediately; borrowed legacy handles stay valid. */
  invalidate(key: string): void { this.evict(key) }

  /** Clears lookup and cancels pending commits; never interrupts paint or
   * shrinks an active lease. Retired storage is released by its last borrower.
   * Attempts every cleanup before reporting the first native disposal failure. */
  clear(): void {
    this.generation++
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    let failure: unknown
    for (const key of Array.from(this.cache.keys())) { try { this.evict(key) } catch (error) { failure ??= error } }
    for (const entry of Array.from(this.retired)) if (entry.pins === 0) { try { this.destroy(entry) } catch (error) { failure ??= error } }
    if (failure) throw failure
  }

  /** Completed retained bytes, including retired pins/signatures; pending separate. */
  size(): number { return this.usedBytes }
  count(): number { return this.cache.size }

  /** Numeric diagnostics; pixelBytes is already part of CanvasMemoryTracker. */
  getSnapshot() {
    let pixelBytes = 0, pinnedBytes = 0
    for (const entry of [...Array.from(this.cache.values()), ...Array.from(this.retired)]) {
      pixelBytes += entry.pixelBytes; if (entry.pins) pinnedBytes += entry.bytes
    }
    return { maxBytes: this.maxBytes, residentBytes: this.usedBytes, pixelBytes,
      metadataBytes: this.usedBytes - pixelBytes, pendingBytes: this.pendingBytes,
      entries: this.cache.size, retiredEntries: this.retired.size, pinnedBytes, pendingEntries: this.pendingEntries,
      maxEntries: this.maxEntries, peakBytes: this.peakBytes,
      hits: this.hits, misses: this.misses, allocations: this.allocations,
      evictions: this.evictions, budgetDenials: this.denials, allocationFailures: this.failures }
  }

  /** Admit against retained, retired and pending storage. Protected/pending
   * working sets are tested before useful idle entries are discarded. */
  private makeRoom(bytes: number, count: number): boolean {
    const fits = () => this.usedBytes + this.pendingBytes + bytes <= this.maxBytes
      && this.cache.size + this.retired.size + this.pendingEntries + count <= this.maxEntries
    if (fits()) return true
    const idle = Array.from(this.cache).filter(([, entry]) => entry.pins === 0)
    const reclaimableBytes = idle.reduce((sum, [, entry]) => sum + entry.bytes, 0)
    if (this.usedBytes + this.pendingBytes + bytes - reclaimableBytes > this.maxBytes
      || this.cache.size + this.retired.size + this.pendingEntries + count - idle.length > this.maxEntries) return false
    for (const [key] of idle) { this.evict(key); if (fits()) return true }
    return fits()
  }
  /** Remove cache lookup immediately, but preserve an active borrow's storage. */
  private evict(key: string): void {
    const entry = this.cache.get(key)
    if (!entry) return
    this.cache.delete(key); this.retired.add(entry); this.evictions++
    if (entry.lost) entry.canvas.removeEventListener?.('contextlost', entry.lost)
    entry.reservation?.protect()
    if (entry.pins === 0) this.destroy(entry)
  }
  /** Physically dispose before releasing shared/local charges. On failure the
   * retired record remains charged for explicit retry/diagnostics. */
  private destroy(entry: CacheEntry): void {
    if (entry.owned) entry.canvas.width = entry.canvas.height = 0
    this.usedBytes -= entry.bytes; this.retired.delete(entry); entry.reservation?.release()
  }
  /** A completed unused entry is recoverable under global pressure. */
  private allowSharedReclaim(key: string, entry: CacheEntry): void {
    if (entry.pins === 0 && this.cache.get(key) === entry) entry.reservation?.allowReclaim(() => this.evict(key))
  }
  /** One non-rendering timer expires only owned entries; refreshed hits survive. */
  private scheduleExpiry(delay = this.maxIdleMs): void {
    if (this.timer !== undefined || this.maxIdleMs === 0) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      const now = this.now()
      let next = Infinity
      this.cache.forEach((entry, key) => {
        if (!entry.owned) return
        if (now - entry.lastUsed >= this.maxIdleMs) this.evict(key)
        else next = Math.min(next, this.maxIdleMs - (now - entry.lastUsed))
      })
      if (next !== Infinity) this.scheduleExpiry(next)
    }, Math.max(1, delay))
    ;(this.timer as { unref?: () => void }).unref?.()
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
  canvasMemoryTracker.track(c)
  return c
}

export interface WebGLOffscreen {
  canvas: HTMLCanvasElement
  gl:     WebGL2RenderingContext | WebGLRenderingContext
}

/**
 * Allocates a detached canvas with a WebGL context, configured for compositing
 * back onto a 2D canvas: premultiplied alpha + no depth/stencil. Returns null
 * in SSR or when the requested context cannot be created (caller falls back to
 * Canvas 2D). Used by the GPU particle backends.
 */
export function createWebGLOffscreen(
  width:     number,
  height:    number,
  glVersion: 2 | 1,
): WebGLOffscreen | null {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width  = width
  canvas.height = height

  const attrs: WebGLContextAttributes = {
    alpha:                 true,
    premultipliedAlpha:    true,
    antialias:             false,
    depth:                 false,
    stencil:               false,
    preserveDrawingBuffer: false,
  }

  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null
  if (glVersion === 2) {
    gl = canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null
  }
  if (!gl) {
    gl = (canvas.getContext('webgl', attrs) ??
      canvas.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null
  }
  if (!gl) return null

  canvasMemoryTracker.track(canvas, 'webgl')

  return { canvas, gl }
}
