interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/**
 * Optional WebGL2 particle-draw timing. At most three outstanding queries, no
 * gl.finish/readPixels or busy waiting. Results are read on panel sampling after
 * control returned to the browser. Disjoint/context-loss results are discarded.
 * Queries bracket drawArraysInstanced only, not Canvas2D composition/other GPU
 * passes, and never represent total GPU utilization. Unsupported WebGL1 returns
 * null timing while retaining draw counters.
 * https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
 */
export class WebGLDrawProbe {
  private ext: TimerExtension | null = null
  private enabled = false
  private pending: WebGLQuery[] = []
  private current: WebGLQuery | null = null
  private gpuMs: number | null = null
  private gpuSampleAt: number | null = null
  private drawCalls = 0
  private lastInstances = 0
  private lastDrawAt: number | null = null

  constructor(private gl: WebGL2RenderingContext | null) { this.restore() }

  /** Reprobes only this existing context; context restoration invalidates prior measurements. */
  restore(): void {
    this.invalidate()
    this.ext = this.gl?.getExtension('EXT_disjoint_timer_query_webgl2') ?? null
  }

  /** Disabling observation releases all query resources immediately. */
  setSampling(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.clearQueries()
  }

  /** Starts a non-overlapping query when supported and bounded queue capacity permits. */
  begin(): WebGLQuery | null {
    if (!this.enabled || !this.gl || !this.ext || this.current || this.pending.length >= 3) return null
    const query = this.gl.createQuery()
    if (!query) return null
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query)
    this.current = query
    return query
  }

  /** Ends only the query returned by begin; safe for an unsupported/skipped sample. */
  end(query: WebGLQuery | null): void {
    if (!query || query !== this.current || !this.gl || !this.ext) return
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.pending.push(query)
    this.current = null
  }

  /** Records an actual submitted instanced draw, not configured maxParticles. */
  recordDraw(instances: number): void {
    this.drawCalls++
    this.lastInstances = instances
    this.lastDrawAt = performance.now()
  }

  /** Detaches invalid query state after context loss; counters still describe the session. */
  invalidate(): void {
    this.clearQueries()
    this.gpuMs = this.gpuSampleAt = null
  }

  /** Polls only available asynchronous results; invalidated timing is never published as zero. */
  getSnapshot() {
    const gl = this.gl, ext = this.ext
    if (this.enabled && gl && ext && this.pending.length) {
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) this.invalidate()
      else this.pending = this.pending.filter(query => {
        if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return true
        const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number
        if (Number.isFinite(ns) && ns >= 0) {
          this.gpuMs = ns / 1e6
          this.gpuSampleAt = performance.now()
        }
        gl.deleteQuery(query)
        return false
      })
    }
    return { drawCalls: this.drawCalls, lastInstances: this.lastInstances, lastDrawAt: this.lastDrawAt,
      timerSupported: !!ext, gpuMs: this.gpuMs, gpuSampleAt: this.gpuSampleAt }
  }

  /** Releases driver query objects; does not change program/buffers or schedule further draws. */
  private clearQueries(): void {
    if (this.gl && this.current && this.ext) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
      this.gl.deleteQuery(this.current)
    }
    this.current = null
    this.pending.forEach(query => this.gl?.deleteQuery(query))
    this.pending = []
  }
}
