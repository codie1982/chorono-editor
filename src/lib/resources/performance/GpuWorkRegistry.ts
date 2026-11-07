export interface GpuWorkSnapshot {
  backend: string
  contextLost: boolean
  bufferBytes: number
  stagingBytes: number
  drawCalls: number
  lastInstances: number
  lastDrawAt: number | null
  timerSupported: boolean
  gpuMs: number | null
  gpuSampleAt: number | null
}
interface GpuWorkSource {
  getSnapshot(): GpuWorkSnapshot
  setSampling(enabled: boolean): void
}

/**
 * Explicit GPU diagnostic ownership. Backends register after initialization and
 * unregister on dispose; only an observed/visible panel enables GPU queries.
 * CPU-side counters remain cheap and cumulative. No polling or context creation.
 */
export class GpuWorkRegistry {
  private sources = new Set<GpuWorkSource>()
  private observers = 0

  /** Registers an already-owned backend; the returned cleanup never disposes its rendering resources. */
  register(source: GpuWorkSource): () => void {
    this.sources.add(source)
    source.setSampling(this.observers > 0)
    return () => { source.setSampling(false); this.sources.delete(source) }
  }

  /** Reference-counted, idempotent observation lease; final release deletes pending queries. */
  observe(): () => void {
    if (++this.observers === 1) this.sources.forEach(source => source.setSampling(true))
    let active = true
    return () => {
      if (!active) return
      active = false
      if (--this.observers === 0) this.sources.forEach(source => source.setSampling(false))
    }
  }

  /** Returns detached numeric diagnostics; hardware/driver totals remain unavailable. */
  getSnapshot(): GpuWorkSnapshot[] {
    return Array.from(this.sources, source => source.getSnapshot())
  }
}

export const gpuWorkRegistry = new GpuWorkRegistry()
