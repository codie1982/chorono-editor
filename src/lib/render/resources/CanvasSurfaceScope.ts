import { createOffscreen } from '../OffscreenCanvasCache'
import type { CanvasSurfaceLease, CanvasSurfaceProvider } from './CanvasSurfacePool'

/** Small ownership contract for synchronous canvas algorithms; never release borrowed input pixels. */
export interface CanvasSurfaceAllocator {
  readonly cropped?: boolean
  create(width: number, height: number): HTMLCanvasElement
  release(canvas: HTMLCanvasElement): void
  owns(canvas: HTMLCanvasElement): boolean
}

/** A backend cannot preserve a cropped pass. The host may retry once with the
 * full composition after disposing all partial leases; budget errors differ. */
export class SurfaceRegionFallback extends Error {}

/**
 * Owns a render operation's active leases from an injected shared provider.
 * No scene/frame is retained. Results remain valid only until release/dispose;
 * consumers must composite them synchronously. Nested operations use separate
 * scopes, so releasing a child cannot return the parent's borrowed surfaces.
 * Dispose in finally: admission, effect and destination errors all propagate.
 */
export class CanvasSurfaceScope implements CanvasSurfaceAllocator {
  private readonly leases = new Map<HTMLCanvasElement, CanvasSurfaceLease>()
  private disposed = false

  /** Borrows lazily; provider admission/reset semantics remain authoritative. */
  constructor(private readonly provider: CanvasSurfaceProvider, readonly cropped = false) {}

  /** Returns exclusive, transparent backing pixels; no allocation after disposal. */
  create(width: number, height: number): HTMLCanvasElement {
    if (this.disposed) throw new Error('Canvas surface scope is disposed.')
    const lease = this.provider.acquire(width, height)
    this.leases.set(lease.canvas, lease)
    return lease.canvas
  }

  /** Tests current lease membership, not whether some other scope/pool owns a canvas. */
  owns(canvas: HTMLCanvasElement): boolean { return this.leases.has(canvas) }

  /** Idempotently returns this scope's lease; a borrowed input/foreign canvas is untouched. */
  release(canvas: HTMLCanvasElement): void {
    const lease = this.leases.get(canvas)
    if (!lease) return
    this.leases.delete(canvas)
    lease.release()
  }

  /** Returns every active lease even if one provider release fails; throws the first cleanup error. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    releaseAll(Array.from(this.leases.keys()), canvas => this.release(canvas))
  }
}

/** Legacy effect outputs transfer to the caller; intermediates can still be explicitly shrunk. */
const standaloneCanvases: CanvasSurfaceAllocator = {
  create: createOffscreen,
  release(canvas) { canvas.width = canvas.height = 0 },
  owns: () => false,
}

/**
 * Runs one synchronous effect, releasing all local scratch except its returned
 * output. With a parent allocator the output stays owned by that parent; without
 * one it is an ordinary caller-owned canvas, preserving legacy apply() results.
 * Input/GPU singleton canvases are borrowed and never put into the local set.
 * A thrown draw/admission error also releases any partially created output.
 */
export function withCanvasSurfaceResult(
  allocator: CanvasSurfaceAllocator | undefined,
  draw: (local: CanvasSurfaceAllocator) => HTMLCanvasElement,
): HTMLCanvasElement {
  const source = allocator ?? standaloneCanvases
  const owned = new Set<HTMLCanvasElement>()
  const local: CanvasSurfaceAllocator = {
    cropped: source.cropped,
    create(width, height) {
      const canvas = source.create(width, height)
      owned.add(canvas)
      return canvas
    },
    release(canvas) { if (owned.delete(canvas)) source.release(canvas) },
    owns: canvas => owned.has(canvas),
  }
  let result: HTMLCanvasElement | undefined
  try { result = draw(local); return result }
  finally { releaseAll(Array.from(owned).filter(canvas => canvas !== result), canvas => local.release(canvas)) }
}

/** Attempts every release and reports the first failure; cleanup never strands later leases. */
function releaseAll(canvases: readonly HTMLCanvasElement[], release: (canvas: HTMLCanvasElement) => void): void {
  let failure: unknown
  canvases.forEach(canvas => { try { release(canvas) } catch (error) { failure ??= error } })
  if (failure) throw failure
}
