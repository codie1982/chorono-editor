// ── WebGLInstancedQuadBackend ─────────────────────────────────────────────────────
//
// Instanced-quad particle renderer. One unit quad is drawn `count` times via
// instancing; each instance reads its transform/colour/shape from a per-instance
// vertex buffer. This replaces the per-particle save/translate/rotate/fill/restore
// loop of the CPU path with a single instanced draw call.
//
// Works on:
//   - WebGL2  → native drawArraysInstanced + VAO
//   - WebGL1  → ANGLE_instanced_arrays (+ OES_vertex_array_object when present)
//
// Coordinate system: particle positions are layer-local. The full current
// canvas transform and backing-pixel projection are combined into u_transform,
// preserving parents, repeater instances and viewport/DPR transforms. The GL
// canvas is then composited at identity by GPUCompositor. Legacy callers may
// still supply a resolved root-layer transform and composition projection.

import { ParticleGPUBackend, type GPUParticleDrawParams, type ParticleBackingTransform } from './ParticleGPUBackend'
import { createWebGLOffscreen } from '../../OffscreenCanvasCache'
import type { DisplayTransform } from '../../resolveDisplayTransform'
import type { GPUCapabilityReport } from '../GPUCapabilities'
import { WebGLDrawProbe } from '../WebGLDrawProbe'
import { gpuWorkRegistry } from '@/lib/resources/performance/GpuWorkRegistry'
import { WebGLParticleResources } from './WebGLParticleResources'
import { GpuAdmissionError, GpuBackendUnavailableError, gpuStorageAllocator } from '../resources'
import type { ResourceAllocator } from '@/lib/resources/budget'

/**
 * Combined layer-local → clip-space matrix: ortho(W, H) ∘ layerTransform.
 * Mirrors the affine CanvasRenderer.renderLayer applies via ctx ops:
 *   translate(x+ax, y+ay) · rotate · scale · translate(-ax, -ay)
 * Returned column-major for gl.uniformMatrix3fv.
 */
export function buildParticleTransformMatrix(
  compW:   number,
  compH:   number,
  dt:      DisplayTransform,
  anchorX: number,
  anchorY: number,
): Float32Array {
  const rad = (dt.rotationDeg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const sx = dt.scaleX
  const sy = dt.scaleY
  const ax = anchorX
  const ay = anchorY
  const tx = dt.x + ax
  const ty = dt.y + ay

  // T_layer (2×3 affine): [m00 m01 m02 ; m10 m11 m12]
  const m00 = c * sx
  const m01 = -s * sy
  const m10 = s * sx
  const m11 = c * sy
  const m02 = tx - (m00 * ax + m01 * ay)
  const m12 = ty - (m10 * ax + m11 * ay)

  // ortho: worldX → 2/W · X − 1 ; worldY → −2/H · Y + 1 (y-flip)
  const ox = 2 / compW
  const oy = -2 / compH

  // column-major mat3 of ortho ∘ T_layer
  return new Float32Array([
    ox * m00,        oy * m10,        0,
    ox * m01,        oy * m11,        0,
    ox * m02 - 1,    oy * m12 + 1,    1,
  ])
}

/** Preserve the canvas's complete affine basis when compositing at identity.
 * Project backing pixels rather than composition units, so DPR/zoom, nested
 * anchors, parent rotation and shear are applied exactly once. */
export function buildParticleAffineTransformMatrix(
  backingW: number,
  backingH: number,
  transform: ParticleBackingTransform,
): Float32Array {
  if (!(backingW > 0 && backingH > 0)
    || ![backingW, backingH, transform.a, transform.b, transform.c, transform.d, transform.e, transform.f].every(Number.isFinite)) {
    throw new Error('Particle backing transform must have finite values and positive dimensions.')
  }
  const ox = 2 / backingW, oy = -2 / backingH
  return new Float32Array([
    ox * transform.a, oy * transform.b, 0,
    ox * transform.c, oy * transform.d, 0,
    ox * transform.e - 1, oy * transform.f + 1, 1,
  ])
}

/**
 * Draw orchestration for a context-local, budgeted particle workspace. Buffer
 * packing/VAO/program ownership lives in WebGLParticleResources; this backend
 * owns native events, transform/blend evaluation and optional draw timing.
 * Idle reclaim preserves the reusable context, while dispose removes handlers
 * and metrics permanently. Admission failures propagate; hardware failures retain
 * the established CPU fallback. Canvas output is borrowed within the JS job.
 */
export class WebGLInstancedQuadBackend extends ParticleGPUBackend {
  private readonly isGL2: boolean
  private readonly glCanvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext | WebGLRenderingContext
  private readonly resources: WebGLParticleResources
  private readonly probe: WebGLDrawProbe
  private readonly unregisterMetrics: () => void
  private disposed = false
  private available = true
  protected get eventSourceId(): string { return 'WebGLInstancedQuadBackend' }

  /** Bounded zero-sized bootstrap context only; program, VBO and staging stores
   * are created by the first admitted draw, never at 50k-particle capacity. */
  constructor(cap: GPUCapabilityReport, budget: ResourceAllocator = gpuStorageAllocator) {
    super()
    const off = createWebGLOffscreen(1,1,cap.tier === 'webgl2' ? 2 : 1)
    if (!off) throw new Error('[GPUParticle] WebGL context unavailable')
    this.glCanvas = off.canvas; this.gl = off.gl
    this.glCanvas.width = this.glCanvas.height = 0
    this.isGL2 = typeof (this.gl as WebGL2RenderingContext).drawArraysInstanced === 'function'
    this.probe = new WebGLDrawProbe(this.isGL2 ? this.gl as WebGL2RenderingContext : null)
    this.resources = new WebGLParticleResources(this.gl,this.glCanvas,this.isGL2,cap,() => this.probe.invalidate(),budget)
    this.glCanvas.addEventListener('webglcontextlost',this.lost)
    this.glCanvas.addEventListener('webglcontextrestored',this.restored)
    this.unregisterMetrics = gpuWorkRegistry.register({
      setSampling: enabled => this.probe.setSampling(enabled),
      clearIdle: () => { this.resources.clearIdle(); if (this.disposed && !this.resources.getSnapshot().cleanupFailed) this.unregisterMetrics() },
      getSnapshot: () => ({ ...this.probe.getSnapshot(), backend:this.isGL2 ? 'WebGL2 particles' : 'WebGL1 particles',
        contextLost:this._contextLost,drawKind:'instanced' as const,textureBytes:0,...this.resources.getSnapshot() }),
    })
    this.emit('gpu:backend-created',{tier:cap.tier,renderer:cap.renderer})
  }
  /** Borrowed current-job result, consumed synchronously by GPUCompositor. */
  get canvas(): HTMLCanvasElement { return this.glCanvas }

  /** Draw all packed live instances in one native submission. No source mutation
   * or retention. GPU/CPU staging growth is admitted before packing/uploading. */
  draw(params: GPUParticleDrawParams): boolean {
    if (this.disposed || this._contextLost || !this.available) return false
    if (params.backingW === 0 || params.backingH === 0) return false
    const gl = this.gl
    try {
      const count = this.resources.prepare(params)
      gl.viewport(0,0,this.glCanvas.width,this.glCanvas.height)
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT)
      if (!count) return true
      gl.blendEquation(gl.FUNC_ADD)
      if (params.cfg.rendering.blendMode === 'additive') gl.blendFunc(gl.ONE,gl.ONE)
      else gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA)
      const matrix = params.localToBacking
        ? buildParticleAffineTransformMatrix(params.backingW,params.backingH,params.localToBacking)
        : buildParticleTransformMatrix(params.compositionW,params.compositionH,params.displayTransform,params.anchorX,params.anchorY)
      this.resources.bind(matrix,params.cfg.particle.starPoints ?? 5)
      const query = this.probe.begin()
      try { this.resources.draw(count) } finally { this.probe.end(query) }
      this.probe.recordDraw(count); gl.flush(); this.emit('gpu:render-complete',{count})
      return true
    } catch (error) {
      if (error instanceof GpuAdmissionError) throw error
      this.resources.clear()
      if (error instanceof GpuBackendUnavailableError) this.available = false
      this.emit('gpu:render-error',{phase:'draw',message:String(error)}); return false
    }
  }
  /** Idempotent final shutdown. Removed listeners cannot resurrect storage. */
  dispose(): void {
    this.resources.clear()
    if (!this.resources.getSnapshot().cleanupFailed) this.unregisterMetrics()
    if (this.disposed) return
    this.disposed = true
    this.glCanvas.removeEventListener('webglcontextlost',this.lost)
    this.glCanvas.removeEventListener('webglcontextrestored',this.restored)
    this.emit('gpu:dispose')
  }
  /** Native loss invalidates old pixel/handle borrows, not source particles. */
  private readonly lost = (event: Event): void => {
    event.preventDefault(); this._contextLost = true; this.resources.clear(); this.emit('gpu:context-lost')
  }
  /** Rebuild lazily through admission on the next draw. */
  private readonly restored = (): void => {
    this.resources.clear(); this.probe.restore(); this.available = true
    this._contextLost = false; this.emit('gpu:context-restored')
  }
}
