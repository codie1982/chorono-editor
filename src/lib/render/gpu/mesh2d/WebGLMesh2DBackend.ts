import { createWebGLOffscreen } from '@/lib/render/OffscreenCanvasCache'
import type { GPUCapabilityReport } from '@/lib/render/gpu/GPUCapabilities'
import { WebGLDrawProbe } from '@/lib/render/gpu/WebGLDrawProbe'
import {
  buildWebGLProgram,
  GpuAdmissionError,
  GpuBackendUnavailableError,
  GpuStorageOwner,
  gpuColorBytes,
  gpuStorageAllocator,
  type GLContext,
} from '@/lib/render/gpu/resources'
import { gpuWorkRegistry } from '@/lib/resources/performance/GpuWorkRegistry'
import type { ResourceAllocator } from '@/lib/resources/budget'
import {
  buildMesh2DAffineTransformMatrix,
  Mesh2DGPUBackend,
  type Mesh2DGPUDrawParams,
} from './Mesh2DGPUBackend'

const STRIDE_BYTES = 4 * Float32Array.BYTES_PER_ELEMENT

/**
 * Budgeted WebGL1/2 textured-triangle backend for fixed-topology Mesh2D.
 *
 * One app-lifetime instance owns a detached transparent context. Vertex streams
 * are de-indexed by the converter, so WebGL1 needs no uint-index extension.
 * The complete current Canvas affine matrix projects layer-local pixels into
 * backing pixels. Context loss and ordinary driver/media errors return false;
 * budget admission failures remain explicit and propagate to the caller.
 */
export class WebGLMesh2DBackend extends Mesh2DGPUBackend {
  private readonly glCanvas: HTMLCanvasElement
  private readonly gl: GLContext
  private readonly isGL2: boolean
  private readonly owner: GpuStorageOwner
  private readonly probe: WebGLDrawProbe
  private readonly unregisterMetrics: () => void
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private texture: WebGLTexture | null = null
  private positionLocation = -1
  private uvLocation = -1
  private matrixLocation: WebGLUniformLocation | null = null
  private alphaLocation: WebGLUniformLocation | null = null
  private textureLocation: WebGLUniformLocation | null = null
  private capacityBytes = 0
  private sourceWidth = 0
  private sourceHeight = 0
  private available = true
  private disposed = false

  constructor(
    private readonly capabilities: GPUCapabilityReport,
    budget: ResourceAllocator = gpuStorageAllocator,
  ) {
    super()
    const offscreen = createWebGLOffscreen(1, 1, capabilities.tier === 'webgl2' ? 2 : 1)
    if (!offscreen) throw new GpuBackendUnavailableError('Mesh2D WebGL context unavailable')
    this.glCanvas = offscreen.canvas
    this.gl = offscreen.gl
    this.isGL2 = typeof (this.gl as WebGL2RenderingContext).createVertexArray === 'function'
    this.glCanvas.width = this.glCanvas.height = 0
    this.probe = new WebGLDrawProbe(this.isGL2 ? this.gl as WebGL2RenderingContext : null)
    this.owner = new GpuStorageOwner(budget, () => this.destroyStorage())
    this.glCanvas.addEventListener('webglcontextlost', this.onContextLost)
    this.glCanvas.addEventListener('webglcontextrestored', this.onContextRestored)
    this.unregisterMetrics = gpuWorkRegistry.register({
      setSampling: enabled => this.probe.setSampling(enabled),
      clearIdle: () => this.owner.clearIdle(),
      getSnapshot: () => ({
        ...this.probe.getSnapshot(), backend: `${this.isGL2 ? 'WebGL2' : 'WebGL1'} Mesh2D`,
        contextLost: this._contextLost, drawKind: 'mesh' as const,
        textureBytes: this.sourceWidth && this.sourceHeight ? gpuColorBytes(this.sourceWidth, this.sourceHeight) : 0,
        bufferBytes: this.capacityBytes, stagingBytes: this.capacityBytes,
        cleanupFailed: this.owner.getSnapshot().failedCleanup,
      }),
    })
  }

  get canvas(): HTMLCanvasElement { return this.glCanvas }

  /** Draws and exposes one transparent full-backing pass for synchronous composition. */
  draw(params: Mesh2DGPUDrawParams): boolean {
    if (this.disposed || this._contextLost || !this.available) return false
    if (!this.valid(params)) return false
    const capacity = growCapacity(this.capacityBytes, params.vertices.byteLength)
    const bytes = gpuColorBytes(params.backingWidth, params.backingHeight)
      + gpuColorBytes(params.sourceWidth, params.sourceHeight) + capacity * 2 + 256
    const changed = !this.program || this.glCanvas.width !== params.backingWidth
      || this.glCanvas.height !== params.backingHeight || capacity !== this.capacityBytes
      || this.sourceWidth !== params.sourceWidth || this.sourceHeight !== params.sourceHeight

    try {
      this.owner.prepare(bytes, changed ? () => this.prepareStorage(params, capacity) : undefined)
      const gl = this.gl
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, params.vertices)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const filter = params.sampling === 'nearest' ? gl.NEAREST : gl.LINEAR
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, params.texture as TexImageSource)
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Mesh2D texture upload failed')

      gl.viewport(0, 0, params.backingWidth, params.backingHeight)
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(this.program)
      gl.uniformMatrix3fv(this.matrixLocation, false, buildMesh2DAffineTransformMatrix(
        params.backingWidth, params.backingHeight, params.localToBacking,
      ))
      gl.uniform1f(this.alphaLocation, Math.max(0, Math.min(1, params.alpha)))
      gl.uniform1i(this.textureLocation, 0)
      this.bindAttributes()
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      const query = this.probe.begin()
      try { gl.drawArrays(gl.TRIANGLES, 0, params.triangleCount * 3) } finally { this.probe.end(query) }
      this.probe.recordDraw(params.triangleCount); gl.flush()
      return gl.getError() === gl.NO_ERROR
    } catch (error) {
      if (error instanceof GpuAdmissionError) throw error
      this.owner.clear()
      if (error instanceof GpuBackendUnavailableError) this.available = false
      return false
    }
  }

  /** Idempotently releases native handles, listeners and diagnostics. */
  dispose(): void {
    this.owner.clear()
    if (this.disposed) return
    this.disposed = true
    this.glCanvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.glCanvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.unregisterMetrics()
  }

  private valid(params: Mesh2DGPUDrawParams): boolean {
    return params.triangleCount > 0 && params.vertices.length === params.triangleCount * 12
      && params.backingWidth > 0 && params.backingHeight > 0
      && params.backingWidth <= this.capabilities.maxTextureSize && params.backingHeight <= this.capabilities.maxTextureSize
      && params.sourceWidth > 0 && params.sourceHeight > 0
      && params.sourceWidth <= this.capabilities.maxTextureSize && params.sourceHeight <= this.capabilities.maxTextureSize
      && Number.isFinite(params.alpha)
  }

  private prepareStorage(params: Mesh2DGPUDrawParams, capacity: number): void {
    const gl = this.gl
    if (!this.program) this.initialize()
    if (this.glCanvas.width !== params.backingWidth) this.glCanvas.width = params.backingWidth
    if (this.glCanvas.height !== params.backingHeight) this.glCanvas.height = params.backingHeight
    if (capacity !== this.capacityBytes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
      gl.bufferData(gl.ARRAY_BUFFER, capacity, gl.DYNAMIC_DRAW)
      this.capacityBytes = capacity
    }
    this.sourceWidth = params.sourceWidth; this.sourceHeight = params.sourceHeight
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Mesh2D GPU storage allocation failed')
  }

  private initialize(): void {
    const gl = this.gl, shader = shaderSource(this.isGL2)
    this.program = buildWebGLProgram(gl, shader.vertex, shader.fragment)
    this.buffer = gl.createBuffer(); this.texture = gl.createTexture()
    if (!this.buffer || !this.texture) throw new GpuBackendUnavailableError('Mesh2D GPU handle allocation failed')
    this.positionLocation = gl.getAttribLocation(this.program, 'a_position')
    this.uvLocation = gl.getAttribLocation(this.program, 'a_uv')
    this.matrixLocation = gl.getUniformLocation(this.program, 'u_matrix')
    this.alphaLocation = gl.getUniformLocation(this.program, 'u_alpha')
    this.textureLocation = gl.getUniformLocation(this.program, 'u_texture')
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE)
  }

  private bindAttributes(): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.enableVertexAttribArray(this.positionLocation)
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, STRIDE_BYTES, 0)
    gl.enableVertexAttribArray(this.uvLocation)
    gl.vertexAttribPointer(this.uvLocation, 2, gl.FLOAT, false, STRIDE_BYTES, 8)
  }

  private destroyStorage(): void {
    const gl = this.gl
    this.probe.invalidate(); gl.useProgram(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindTexture(gl.TEXTURE_2D, null)
    if (this.texture) { gl.deleteTexture(this.texture); this.texture = null }
    if (this.buffer) { gl.deleteBuffer(this.buffer); this.buffer = null }
    if (this.program) { gl.deleteProgram(this.program); this.program = null }
    this.capacityBytes = this.sourceWidth = this.sourceHeight = 0
    this.glCanvas.width = this.glCanvas.height = 0
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault(); this._contextLost = true; this.owner.clear()
  }
  private readonly onContextRestored = (): void => {
    this.owner.clear(); this.probe.restore(); this.available = true; this._contextLost = false
  }
}

function growCapacity(current: number, required: number): number {
  let result = Math.max(64, current)
  while (result < required) result *= 2
  return result
}

function shaderSource(webgl2: boolean): { vertex: string; fragment: string } {
  const body = `precision mediump float;
uniform sampler2D u_texture;
uniform float u_alpha;
VARYING_IN vec2 v_uv;
FRAGMENT_OUT
void main() {
  if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) discard;
  FRAG_COLOR = texture2D(u_texture, v_uv) * u_alpha;
}`
  if (!webgl2) return {
    vertex: `attribute vec2 a_position; attribute vec2 a_uv; uniform mat3 u_matrix; varying vec2 v_uv;
void main() { vec3 p = u_matrix * vec3(a_position, 1.0); gl_Position = vec4(p.xy, 0.0, 1.0); v_uv = a_uv; }`,
    fragment: body.replace('VARYING_IN', 'varying').replace('FRAGMENT_OUT', '').replace('FRAG_COLOR', 'gl_FragColor'),
  }
  return {
    vertex: `#version 300 es
in vec2 a_position; in vec2 a_uv; uniform mat3 u_matrix; out vec2 v_uv;
void main() { vec3 p = u_matrix * vec3(a_position, 1.0); gl_Position = vec4(p.xy, 0.0, 1.0); v_uv = a_uv; }`,
    fragment: `#version 300 es
${body.replace('VARYING_IN', 'in').replace('FRAGMENT_OUT', 'out vec4 outColor;').replace('FRAG_COLOR', 'outColor').replace('texture2D', 'texture')}`,
  }
}
