import { GPUEventEmitter } from '../GPUEvents'
import { gpuCapabilities } from '../GPUCapabilities'
import { createWebGLOffscreen } from '../../OffscreenCanvasCache'
import { GpuStorageOwner, gpuStorageAllocator, gpuColorBytes, type GLContext } from '../resources'
import { gpuWorkRegistry } from '@/lib/resources/performance/GpuWorkRegistry'
import type { ResourceAllocator } from '@/lib/resources/budget'

/**
 * Common two-texture effect workspace: source upload + intermediate RGBA8 target
 * + default canvas color store + 48-byte quad. Concrete effects own shader
 * programs/uniforms and draw algorithms. Native stores are admitted before
 * resizing, protected through synchronous consumption and reclaimed after idle.
 * Programs/handles are destroyed with storage; the tiny bootstrap context stays
 * reusable with a zero-sized canvas. Import creates no context. Context restore
 * prepares lazily through the same admission path. Instances share only budgets.
 */
export abstract class GpuEffectBackend extends GPUEventEmitter {
  protected gl!: GLContext
  protected glCanvas!: HTMLCanvasElement
  protected isGL2 = false
  protected contextLost = false
  protected quadBuffer: WebGLBuffer | null = null
  protected framebuffer: WebGLFramebuffer | null = null
  protected inputTexture: WebGLTexture | null = null
  protected targetTexture: WebGLTexture | null = null
  protected texW = 0
  protected texH = 0
  protected readonly storage: GpuStorageOwner
  private attempted = false
  private available = false
  private disposed = false
  private programsReady = false
  private drawCalls = 0
  private lastDrawAt: number | null = null
  private maxTextureSize = 0
  private unregister?: () => void

  /** Composition may inject an isolated allocator for a job/test; defaults use
   * the shared GPU + editor limits. Construction allocates no platform resource. */
  constructor(budget: ResourceAllocator = gpuStorageAllocator) {
    super(); this.storage = new GpuStorageOwner(budget, () => this.releaseStorage())
  }

  /** Build inside the admitted transaction; release also handles partial init. */
  protected abstract buildPrograms(): void
  protected abstract releasePrograms(): void
  /** Streaming implementations cancel outstanding pass pins on native loss. */
  protected onStorageLost(): void {}

  /** Probe hardware, not admission of an unknown target size. */
  protected ensureInit(): boolean {
    if (this.disposed || this.storage.getSnapshot().failedCleanup) return false
    if (this.attempted) return this.available && !this.contextLost
    this.attempted = true
    const cap = gpuCapabilities.getReport()
    if (cap.tier === 'none') return false
    this.isGL2 = cap.tier === 'webgl2'
    const off = createWebGLOffscreen(1, 1, this.isGL2 ? 2 : 1)
    if (!off) return false
    this.gl = off.gl; this.glCanvas = off.canvas
    this.isGL2 = typeof (this.gl as WebGL2RenderingContext).createVertexArray === 'function'
    this.maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number
    // Context/capability bootstrap is bounded separately from pixel storage.
    this.glCanvas.width = this.glCanvas.height = 0
    this.glCanvas.addEventListener('webglcontextlost', this.lost)
    this.glCanvas.addEventListener('webglcontextrestored', this.restored)
    this.unregister = gpuWorkRegistry.register({ setSampling() {}, clearIdle: () => {
      this.storage.clearIdle(); this.unregisterIfDisposed()
    }, getSnapshot: () => ({
      backend: `${this.isGL2 ? 'WebGL2' : 'WebGL1'} ${this.eventSourceId}`, contextLost: this.contextLost,
      drawKind: 'effect' as const, bufferBytes: this.quadBuffer ? 48 : 0, stagingBytes: 0,
      textureBytes: this.texW * this.texH * 8, drawCalls: this.drawCalls, lastInstances: 0,
      cleanupFailed: this.storage.getSnapshot().failedCleanup,
      lastDrawAt: this.lastDrawAt, timerSupported: false, gpuMs: null, gpuSampleAt: null,
    }) })
    this.available = true
    this.emit('gpu:backend-created', { tier: cap.tier, op: this.eventSourceId })
    return true
  }

  /** Reserve old + complete replacement before native mutation. Same-size calls
   * reuse storage; uploads use texSubImage2D. Publish dimensions only after FBO
   * completeness. RGBA8 estimates exclude opaque driver/internal copies. */
  protected prepare(w: number, h: number): void {
    const bytes = gpuColorBytes(w, h) * 3 + 48
    if (w > this.maxTextureSize || h > this.maxTextureSize) throw new RangeError('GPU effect dimensions exceed MAX_TEXTURE_SIZE.')
    const changed = !this.programsReady || w !== this.texW || h !== this.texH
    this.storage.prepare(bytes, changed ? () => {
      const gl = this.gl
      if (!this.programsReady) {
        try { this.buildPrograms() } catch (error) { this.available = false; throw error }
        this.quadBuffer = gl.createBuffer()
        if (!this.quadBuffer) throw new Error('GPU effect buffer allocation failed.')
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]), gl.STATIC_DRAW)
        this.inputTexture = this.createTexture(); this.targetTexture = this.createTexture()
        this.framebuffer = gl.createFramebuffer()
        if (!this.framebuffer) throw new Error('GPU effect framebuffer allocation failed.')
        this.programsReady = true
      }
      if (this.glCanvas.width !== w) this.glCanvas.width = w
      if (this.glCanvas.height !== h) this.glCanvas.height = h
      for (const texture of [this.inputTexture, this.targetTexture]) {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.targetTexture, 0)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('GPU effect framebuffer is incomplete.')
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.texW = w; this.texH = h
      if (gl.getError() !== gl.NO_ERROR) throw new Error('GPU effect storage allocation failed.')
    } : undefined)
  }

  /** Upload same-size premultiplied pixels without reallocating texture storage.
   * Pixel-unpack state is restored even on a native exception. */
  protected upload(canvas: HTMLCanvasElement): void {
    if (canvas.width !== this.texW || canvas.height !== this.texH) throw new Error('GPU effect sample size differs from its admitted target.')
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.inputTexture)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    try { gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas) }
    finally { gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false) }
  }

  /** Submitted non-instanced passes are separate from particle instance counts. */
  protected recordDraws(count: number): void { this.drawCalls += count; this.lastDrawAt = performance.now() }

  /** Explicit shutdown removes listeners/metrics and prevents restoration. */
  dispose(): void {
    this.disposed = true; this.onStorageLost(); this.storage.clear(); this.available = false
    this.glCanvas?.removeEventListener('webglcontextlost', this.lost)
    this.glCanvas?.removeEventListener('webglcontextrestored', this.restored)
    this.unregisterIfDisposed(); this.emit('gpu:dispose')
  }

  /** Texture names have bounded count; pixel bytes are preflighted separately. */
  private createTexture(): WebGLTexture {
    const gl = this.gl, texture = gl.createTexture()
    if (!texture) throw new Error('GPU effect texture allocation failed.')
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return texture
  }

  /** FBO deletion does not free attachment ownership. Fields are cleared after
   * their successful deletion, preserving partially failed cleanup for retry. */
  private releaseStorage(): void {
    if (!this.gl) return
    const gl = this.gl
    gl.useProgram(null); gl.bindBuffer(gl.ARRAY_BUFFER, null)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null)
    this.releasePrograms(); gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (this.framebuffer) { gl.deleteFramebuffer(this.framebuffer); this.framebuffer = null }
    if (this.inputTexture) { gl.deleteTexture(this.inputTexture); this.inputTexture = null }
    if (this.targetTexture) { gl.deleteTexture(this.targetTexture); this.targetTexture = null }
    if (this.quadBuffer) { gl.deleteBuffer(this.quadBuffer); this.quadBuffer = null }
    this.glCanvas.width = this.glCanvas.height = 0
    this.texW = this.texH = 0; this.programsReady = false
  }
  /** Loss invalidates borrowed results and outstanding streaming pins. */
  private readonly lost = (event: Event): void => {
    event.preventDefault(); this.contextLost = true
    this.onStorageLost(); this.storage.clear(); this.emit('gpu:context-lost')
  }
  /** No eager native storage allocation on restoration. */
  private readonly restored = (): void => {
    this.storage.clear(); this.maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number
    this.available = true; this.contextLost = false; this.emit('gpu:context-restored')
  }
  /** Failed storage stays registered/charged for explicit cleanup retry. */
  private unregisterIfDisposed(): void {
    if (this.disposed && !this.storage.getSnapshot().failedCleanup) { this.unregister?.(); this.unregister = undefined }
  }
}
