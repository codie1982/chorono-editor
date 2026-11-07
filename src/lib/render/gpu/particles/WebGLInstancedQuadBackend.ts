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
import { ParticleBufferPacker, FLOATS_PER_PARTICLE } from './ParticleBufferPacker'
import { buildParticleShaderSources } from './WebGLParticleShader'
import { createWebGLOffscreen } from '../../OffscreenCanvasCache'
import type { DisplayTransform } from '../../resolveDisplayTransform'
import type { GPUCapabilityReport } from '../GPUCapabilities'
import { WebGLDrawProbe } from '../WebGLDrawProbe'
import { gpuWorkRegistry } from '@/lib/resources/performance/GpuWorkRegistry'

const INITIAL_MAX_PARTICLES = 50_000
const STRIDE_BYTES = FLOATS_PER_PARTICLE * 4

const INSTANCE_ATTRIBS: ReadonlyArray<{ name: string; size: number; offset: number }> = [
  { name: 'a_position',   size: 2, offset: 0 },
  { name: 'a_size',       size: 1, offset: 2 },
  { name: 'a_rotation',   size: 1, offset: 3 },
  { name: 'a_opacity',    size: 1, offset: 4 },
  { name: 'a_color',      size: 4, offset: 5 },
  { name: 'a_shapeId',    size: 1, offset: 9 },
  { name: 'a_shapeParam', size: 1, offset: 10 },
]

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

export class WebGLInstancedQuadBackend extends ParticleGPUBackend {
  private cap: GPUCapabilityReport
  private isGL2: boolean
  private glCanvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | WebGLRenderingContext

  private instanceExt: ANGLE_instanced_arrays | null = null
  private vaoExt: OES_vertex_array_object | null = null

  private program: WebGLProgram | null = null
  private quadBuffer: WebGLBuffer | null = null
  private instanceBuffer: WebGLBuffer | null = null
  private vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null = null

  private uTransform: WebGLUniformLocation | null = null
  private uStarPoints: WebGLUniformLocation | null = null
  private attribLoc: Record<string, number> = {}

  private gpuCapacity = INITIAL_MAX_PARTICLES
  private packer = new ParticleBufferPacker()
  private probe: WebGLDrawProbe
  private unregisterMetrics: () => void

  protected get eventSourceId(): string {
    return 'WebGLInstancedQuadBackend'
  }

  constructor(cap: GPUCapabilityReport) {
    super()
    this.cap = cap
    this.isGL2 = cap.tier === 'webgl2'

    const off = createWebGLOffscreen(1, 1, this.isGL2 ? 2 : 1)
    if (!off) throw new Error('[GPUParticle] WebGL context unavailable')
    this.glCanvas = off.canvas
    this.gl = off.gl
    this.probe = new WebGLDrawProbe(this.isGL2 ? this.gl as WebGL2RenderingContext : null)

    this.registerContextHandlers()
    this.initialize()
    this.unregisterMetrics = gpuWorkRegistry.register({
      setSampling: enabled => this.probe.setSampling(enabled),
      getSnapshot: () => ({ ...this.probe.getSnapshot(), backend: this.isGL2 ? 'WebGL2 parçacık' : 'WebGL1 parçacık',
        contextLost: this._contextLost,
        bufferBytes: this._contextLost ? 0 : this.gpuCapacity * STRIDE_BYTES + 12 * 4,
        stagingBytes: this.packer.getBuffer().byteLength }),
    })
    this.emit('gpu:backend-created', { tier: cap.tier, renderer: cap.renderer })
  }

  get canvas(): HTMLCanvasElement {
    return this.glCanvas
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  private registerContextHandlers(): void {
    this.glCanvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this._contextLost = true
      this.probe.invalidate()
      this.emit('gpu:context-lost')
    })
    this.glCanvas.addEventListener('webglcontextrestored', () => {
      try {
        this.initialize()
        this.probe.restore()
        this._contextLost = false
        this.emit('gpu:context-restored')
      } catch (err) {
        this._contextLost = true
        this.emit('gpu:render-error', { phase: 'restore', message: String(err) })
      }
    })
  }

  private initialize(): void {
    const gl = this.gl

    if (!this.isGL2) {
      this.instanceExt = gl.getExtension('ANGLE_instanced_arrays')
      this.vaoExt = gl.getExtension('OES_vertex_array_object')
      gl.getExtension('OES_standard_derivatives')
      if (!this.instanceExt) throw new Error('[GPUParticle] ANGLE_instanced_arrays unavailable')
    }

    const src = buildParticleShaderSources(this.isGL2, this.cap.supportsStandardDerivatives)
    this.program = this.buildProgram(src.vertex, src.fragment)

    for (const a of INSTANCE_ATTRIBS) {
      this.attribLoc[a.name] = gl.getAttribLocation(this.program, a.name)
    }
    this.attribLoc['a_corner'] = gl.getAttribLocation(this.program, 'a_corner')
    this.uTransform = gl.getUniformLocation(this.program, 'u_transform')
    this.uStarPoints = gl.getUniformLocation(this.program, 'u_starPoints')

    // Unit quad (two triangles), corners in [-0.5, 0.5]
    const quad = new Float32Array([
      -0.5, -0.5,   0.5, -0.5,   0.5, 0.5,
      -0.5, -0.5,   0.5,  0.5,  -0.5, 0.5,
    ])
    this.quadBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)

    this.instanceBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.gpuCapacity * STRIDE_BYTES, gl.DYNAMIC_DRAW)

    this.createVAO()

    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
  }

  dispose(): void {
    this.unregisterMetrics()
    const gl = this.gl
    if (this.program) gl.deleteProgram(this.program)
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer)
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer)
    if (this.vao) {
      if (this.isGL2) (gl as WebGL2RenderingContext).deleteVertexArray(this.vao as WebGLVertexArrayObject)
      else if (this.vaoExt) this.vaoExt.deleteVertexArrayOES(this.vao as WebGLVertexArrayObjectOES)
    }
    this.emit('gpu:dispose')
  }

  // ── Draw ────────────────────────────────────────────────────────────────────────

  draw(params: GPUParticleDrawParams): boolean {
    if (this._contextLost || !this.program) return false
    const gl = this.gl

    try {
      const count = this.packer.pack(
        params.instances, params.cfg, params.relativeTime, params.layerAlpha,
      )

      this.ensureSize(params.backingW, params.backingH)
      gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      if (count === 0) return true

      // Upload instance data — grow GPU buffer if the live count exceeds capacity.
      const buf = this.packer.getBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
      if (count > this.gpuCapacity) {
        gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW)
        this.gpuCapacity = Math.floor(buf.length / FLOATS_PER_PARTICLE)
      } else {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, count * FLOATS_PER_PARTICLE))
      }

      // GL-internal blend: additive accumulates, everything else premultiplied-over.
      // Scene-level screen/multiply is applied later by GPUCompositor.
      gl.blendEquation(gl.FUNC_ADD)
      if (params.cfg.rendering.blendMode === 'additive') gl.blendFunc(gl.ONE, gl.ONE)
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

      gl.useProgram(this.program)
      const mat = params.localToBacking
        ? buildParticleAffineTransformMatrix(params.backingW, params.backingH, params.localToBacking)
        : buildParticleTransformMatrix(params.compositionW, params.compositionH,
          params.displayTransform, params.anchorX, params.anchorY)
      gl.uniformMatrix3fv(this.uTransform, false, mat)
      gl.uniform1i(this.uStarPoints, params.cfg.particle.starPoints ?? 5)

      if (this.vao) this.bindVAO()
      else this.setupAttribs()

      const query = this.probe.begin()
      try { this.drawInstanced(6, count) } finally { this.probe.end(query) }
      this.probe.recordDraw(count)

      if (this.vao) this.unbindVAO()
      gl.flush()

      this.emit('gpu:render-complete', { count })
      return true
    } catch (err) {
      this.emit('gpu:render-error', { phase: 'draw', message: String(err) })
      return false
    }
  }

  private ensureSize(w: number, h: number): void {
    if (this.glCanvas.width !== w || this.glCanvas.height !== h) {
      this.glCanvas.width = w
      this.glCanvas.height = h
    }
  }

  // ── VAO / attribute setup ─────────────────────────────────────────────────────

  private createVAO(): void {
    const gl = this.gl
    if (this.isGL2) this.vao = (gl as WebGL2RenderingContext).createVertexArray()
    else if (this.vaoExt) this.vao = this.vaoExt.createVertexArrayOES()
    else this.vao = null

    if (this.vao) {
      this.bindVAO()
      this.setupAttribs()
      this.unbindVAO()
    }
  }

  private setupAttribs(): void {
    const gl = this.gl

    // Per-vertex quad corner (divisor 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    const corner = this.attribLoc['a_corner']
    gl.enableVertexAttribArray(corner)
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)
    this.setDivisor(corner, 0)

    // Per-instance attributes (divisor 1)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    for (const a of INSTANCE_ATTRIBS) {
      const loc = this.attribLoc[a.name]
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, STRIDE_BYTES, a.offset * 4)
      this.setDivisor(loc, 1)
    }
  }

  private bindVAO(): void {
    const gl = this.gl
    if (this.isGL2) (gl as WebGL2RenderingContext).bindVertexArray(this.vao as WebGLVertexArrayObject)
    else if (this.vaoExt) this.vaoExt.bindVertexArrayOES(this.vao as WebGLVertexArrayObjectOES)
  }

  private unbindVAO(): void {
    const gl = this.gl
    if (this.isGL2) (gl as WebGL2RenderingContext).bindVertexArray(null)
    else if (this.vaoExt) this.vaoExt.bindVertexArrayOES(null)
  }

  private setDivisor(index: number, divisor: number): void {
    const gl = this.gl
    if (this.isGL2) (gl as WebGL2RenderingContext).vertexAttribDivisor(index, divisor)
    else if (this.instanceExt) this.instanceExt.vertexAttribDivisorANGLE(index, divisor)
  }

  private drawInstanced(vertexCount: number, instanceCount: number): void {
    const gl = this.gl
    if (this.isGL2) {
      (gl as WebGL2RenderingContext).drawArraysInstanced(gl.TRIANGLES, 0, vertexCount, instanceCount)
    } else if (this.instanceExt) {
      this.instanceExt.drawArraysInstancedANGLE(gl.TRIANGLES, 0, vertexCount, instanceCount)
    }
  }

  // ── Shader compilation ────────────────────────────────────────────────────────

  private buildProgram(vsSrc: string, fsSrc: string): WebGLProgram {
    const gl = this.gl
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSrc)
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSrc)

    const program = gl.createProgram()
    if (!program) throw new Error('[GPUParticle] createProgram failed')
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[GPUParticle] Program link error:', log)
      }
      throw new Error(`[GPUParticle] Program link failed: ${log ?? 'unknown'}`)
    }
    return program
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl
    const shader = gl.createShader(type)
    if (!shader) throw new Error('[GPUParticle] createShader failed')
    gl.shaderSource(shader, src)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[GPUParticle] Shader compile error:', log)
      }
      throw new Error(`[GPUParticle] Shader compile failed: ${log ?? 'unknown'}`)
    }
    return shader
  }
}
