import { createOffscreen } from '../OffscreenCanvasCache'

/** Read-only counters for this pool's RGBA8 pixel reservations, not process/GPU RAM. */
export interface CanvasSurfacePoolSnapshot {
  maxBytes: number
  residentBytes: number
  activeBytes: number
  idleBytes: number
  peakResidentBytes: number
  activeSurfaces: number
  idleSurfaces: number
  allocations: number
  reuses: number
  evictions: number
  budgetDenials: number
}

/** A borrowed surface. Do not resize or retain it after the idempotent release. */
export interface CanvasSurfaceLease {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
  release(): void
}

/** Minimal dependency for render consumers; implementations own allocation and cleanup. */
export interface CanvasSurfaceProvider {
  acquire(width: number, height: number): CanvasSurfaceLease
}

export interface CanvasSurfacePoolOptions {
  /** Shared retained + active RGBA8 estimate. Defaults to 128 MiB (four 4K surfaces). */
  maxBytes?: number
  /** Idle surfaces expire without driving a render loop. Defaults to 2 seconds. */
  maxIdleMs?: number
  /** Synchronous allocator; injection permits platform-independent lifecycle tests. */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement
}

interface Surface {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  width: number
  height: number
  bytes: number
  releasedAt: number
}

/**
 * Owns temporary Canvas2D surfaces, distinct from versioned content caches.
 *
 * An active lease is never reused/evicted. Idle surfaces are reused by exact
 * backing dimensions, evicted in release order under pressure, and expired by
 * one idle timer. Admission occurs before allocation; an unsatisfied request
 * throws RangeError rather than silently dropping pixels or exceeding budget.
 *
 * Every reuse resets canvas.width, including pixels, clipping, saved states and
 * origin-clean state. Resetting only drawing properties would leak clip/taint
 * between unrelated layers. Browser backing-store allocation/RSS is outside
 * these estimated counters; canvas object reuse is not a zero-allocation claim.
 *
 * Native EventTarget exposes allocation, eviction, budgetexceeded and dispose
 * lifecycle events. Consumers read getSnapshot(); per-frame reuse emits no event.
 */
export class CanvasSurfacePool extends EventTarget implements CanvasSurfaceProvider {
  private readonly maxBytes: number
  private readonly maxIdleMs: number
  private readonly createCanvas: NonNullable<CanvasSurfacePoolOptions['createCanvas']>
  private readonly idle = new Map<HTMLCanvasElement, Surface>()
  private readonly active = new Set<Surface>()
  private residentBytes = 0
  private peakResidentBytes = 0
  private allocations = 0
  private reuses = 0
  private evictions = 0
  private budgetDenials = 0
  private cleanupTimer?: ReturnType<typeof setTimeout>
  private disposed = false

  /** Configures this pool only; no canvas, renderer or scene is created here. */
  constructor(options: CanvasSurfacePoolOptions = {}) {
    super()
    this.maxBytes = options.maxBytes ?? 128 * 1024 * 1024
    this.maxIdleMs = options.maxIdleMs ?? 2000
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes < 0
      || !Number.isSafeInteger(this.maxIdleMs) || this.maxIdleMs < 0 || this.maxIdleMs > 2_147_483_647) {
      throw new RangeError('Canvas surface budget and idle duration must be non-negative safe integers; idle duration cannot exceed the timer range.')
    }
    this.createCanvas = options.createCanvas ?? ((width, height) => createOffscreen(width, height))
  }

  /**
   * Borrows a transparent, default-state surface in backing pixels.
   * Dimensions must be positive safe integers. Release in finally, including
   * when drawing fails. Throws before allocation if active reservations prevent
   * admission; idle entries can be discarded to admit a different size.
   */
  acquire(width: number, height: number): CanvasSurfaceLease {
    if (this.disposed) throw new Error('Canvas surface pool is disposed.')
    const bytes = width * height * 4
    if (![width, height, bytes].every(Number.isSafeInteger) || width <= 0 || height <= 0) {
      throw new RangeError('Canvas surface dimensions must be positive safe integers.')
    }
    this.expireIdle()
    let allocated = false
    let surface: Surface | undefined
    const entries = this.idle.values()
    let next = entries.next()
    while (!next.done) {
      const item = next.value
      if (item.width === width && item.height === height) { surface = item; break }
      next = entries.next()
    }
    if (surface) {
      this.idle.delete(surface.canvas)
      try {
        surface.canvas.width = width
      } catch (error) {
        this.destroy(surface)
        throw error
      }
      this.reuses++
    } else {
      this.admit(bytes)
      this.residentBytes += bytes
      this.peakResidentBytes = Math.max(this.peakResidentBytes, this.residentBytes)
      let canvas: HTMLCanvasElement | undefined
      try {
        canvas = this.createCanvas(width, height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Failed to acquire a scratch Canvas2D context.')
        surface = { canvas, context, width, height, bytes, releasedAt: 0 }
      } catch (error) {
        this.residentBytes -= bytes
        if (canvas) canvas.width = canvas.height = 0
        throw error
      }
      this.allocations++
      allocated = true
    }
    const borrowed = surface
    this.active.add(borrowed)
    if (allocated) this.dispatchEvent(new Event('allocation'))
    let released = false
    const lease: CanvasSurfaceLease = {
      canvas: borrowed.canvas,
      context: borrowed.context,
      release: () => {
        if (released) return
        released = true
        this.release(borrowed)
      },
    }
    return lease
  }

  /** Returns a detached estimate; active and idle reservations sum to resident. */
  getSnapshot(): CanvasSurfacePoolSnapshot {
    let activeBytes = 0
    this.active.forEach(surface => { activeBytes += surface.bytes })
    return {
      maxBytes: this.maxBytes, residentBytes: this.residentBytes, activeBytes,
      idleBytes: this.residentBytes - activeBytes, peakResidentBytes: this.peakResidentBytes,
      activeSurfaces: this.active.size, idleSurfaces: this.idle.size,
      allocations: this.allocations, reuses: this.reuses,
      evictions: this.evictions, budgetDenials: this.budgetDenials,
    }
  }

  /** Shrinks idle backing stores immediately. Currently borrowed surfaces stay valid. */
  clearIdle(): void {
    if (this.cleanupTimer !== undefined) clearTimeout(this.cleanupTimer)
    this.cleanupTimer = undefined
    this.idle.forEach((surface, canvas) => {
      this.idle.delete(canvas)
      this.destroy(surface)
    })
  }

  /** Stops new borrows; active leases are destroyed when their owners release them. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearIdle()
    this.dispatchEvent(new Event('dispose'))
  }

  /** Makes room using idle LRU entries only; an impossible request preserves them. */
  private admit(bytes: number): void {
    let activeBytes = 0
    this.active.forEach(surface => { activeBytes += surface.bytes })
    if (activeBytes + bytes <= this.maxBytes) {
      while (this.residentBytes + bytes > this.maxBytes && this.idle.size > 0) {
        const oldest = this.idle.values().next().value as Surface
        this.idle.delete(oldest.canvas)
        this.destroy(oldest)
      }
      if (this.residentBytes + bytes <= this.maxBytes) return
    }
    this.budgetDenials++
    this.dispatchEvent(new Event('budgetexceeded'))
    throw new RangeError(`Scratch canvas budget exceeded: ${bytes} bytes requested; ${this.maxBytes - this.residentBytes} available.`)
  }

  /** Returns a lease to warm storage unless disposed, resized or retention is disabled. */
  private release(surface: Surface): void {
    this.active.delete(surface)
    if (this.disposed || this.maxIdleMs === 0
      || surface.canvas.width !== surface.width || surface.canvas.height !== surface.height) {
      this.destroy(surface)
      return
    }
    surface.releasedAt = Date.now()
    this.idle.set(surface.canvas, surface)
    this.scheduleCleanup()
  }

  /** Destroys expired idle entries without affecting an active render/export. */
  private expireIdle(): void {
    const cutoff = Date.now() - this.maxIdleMs
    this.idle.forEach((surface, canvas) => {
      if (surface.releasedAt > cutoff) return
      this.idle.delete(canvas)
      this.destroy(surface)
    })
  }

  /** Keeps a single wakeup; repeated frame releases do not create an idle RAF loop. */
  private scheduleCleanup(): void {
    if (this.cleanupTimer !== undefined || this.idle.size === 0) return
    const oldest = this.idle.values().next().value as Surface
    const delay = Math.max(0, oldest.releasedAt + this.maxIdleMs - Date.now())
    this.cleanupTimer = setTimeout(() => {
      this.cleanupTimer = undefined
      this.expireIdle()
      this.scheduleCleanup()
    }, delay)
    this.cleanupTimer.unref?.()
  }

  /** Releases estimated bytes and shrinks the underlying bitmap; RSS may fall later. */
  private destroy(surface: Surface): void {
    this.residentBytes -= surface.bytes
    surface.canvas.width = surface.canvas.height = 0
    this.evictions++
    this.dispatchEvent(new Event('eviction'))
  }
}

/** Shared host/effect/mask scratch budget; excludes main/GPU canvases and process/heap RAM. */
export const renderSurfacePool = new CanvasSurfacePool()
