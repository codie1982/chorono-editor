type CanvasSize = { width: number; height: number }
type CanvasKind = 'canvas2d' | 'webgl'
export interface CanvasMemorySnapshot {
  supported: boolean
  canvas2dBytes: number
  webglBytes: number
  canvas2dCount: number
  webglCount: number
}

/**
 * Estimates living canvas backing pixels, including detached effect/export
 * surfaces. Weak references never keep a canvas/context alive. A canvas is
 * counted once, at its current dimensions; zero-sized pool evictions cost zero.
 * Finalization removes bookkeeping after GC, and reads sweep dead entries too.
 * RGBA8 estimates exclude driver copies, multisampling and browser overhead.
 * There is no allocation budget or cleanup authority here: owners retain both.
 */
export class CanvasMemoryTracker {
  private nextId = 0
  private ids = new WeakMap<CanvasSize, number>()
  private entries = new Map<number, { ref: WeakRef<CanvasSize>; kind: CanvasKind }>()
  private finalizer = typeof FinalizationRegistry === 'undefined' ? null
    : new FinalizationRegistry<number>(id => this.entries.delete(id))

  /** Cumulative unique registrations, not live surfaces or physical driver allocations. */
  getRegistrationCount(): number { return this.nextId }

  /** Registers by identity without retaining the object. Unsupported hosts explicitly opt out. */
  track(canvas: CanvasSize | undefined, kind: CanvasKind = 'canvas2d'): void {
    if (!canvas || typeof WeakRef === 'undefined' || !this.finalizer) return
    const existing = this.ids.get(canvas)
    if (existing !== undefined) return
    const id = ++this.nextId
    this.ids.set(canvas, id)
    this.entries.set(id, { ref: new WeakRef(canvas), kind })
    this.finalizer.register(canvas, id)
  }

  /** Detached aggregate only; it exposes neither canvas handles nor source URLs. */
  getSnapshot(): CanvasMemorySnapshot {
    const result = { supported: !!this.finalizer, canvas2dBytes: 0, webglBytes: 0, canvas2dCount: 0, webglCount: 0 }
    this.entries.forEach((entry, id) => {
      const canvas = entry.ref.deref()
      if (!canvas) { this.entries.delete(id); return }
      const bytes = canvas.width * canvas.height * 4
      if (!Number.isFinite(bytes) || bytes <= 0) return
      if (entry.kind === 'webgl') { result.webglBytes += bytes; result.webglCount++ }
      else { result.canvas2dBytes += bytes; result.canvas2dCount++ }
    })
    return result
  }
}

export const canvasMemoryTracker = new CanvasMemoryTracker()
