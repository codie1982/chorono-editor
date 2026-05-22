// ── GPUMotionBlur ───────────────────────────────────────────────────────────────
//
// After Effects-style accumulation motion blur. Instead of overlaying a few
// opacity-decaying copies (which reads as discrete "ghosts"), this averages many
// equal-weight sub-frame samples across the shutter interval — producing a
// smooth, continuous smear.
//
// Usage (streaming, so the caller never holds N canvases at once):
//   if (!gpuMotionBlur.begin(w, h, sampleCount)) → fall back to CPU trails
//   for each sub-frame: render the layer to a canvas, gpuMotionBlur.addSample(c)
//   const out = gpuMotionBlur.finish()  → averaged smear, or null on failure
//
// Each sample is uploaded premultiplied and additively blended with weight 1/N,
// so the accumulation buffer holds the average directly (no float texture, no
// 8-bit overflow). A final blit copies it to the GL canvas for compositing.

import { GPUEventEmitter } from '../GPUEvents'
import { gpuCapabilities } from '../GPUCapabilities'
import { createWebGLOffscreen } from '../../OffscreenCanvasCache'
import { buildMotionBlurShaderSources } from './GPUEffectShaders'

class GPUMotionBlur extends GPUEventEmitter {
  private initialized = false
  private available   = false
  private isGL2 = false
  private _contextLost = false

  private glCanvas: HTMLCanvasElement | null = null
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null

  private accumProgram: WebGLProgram | null = null
  private blitProgram: WebGLProgram | null = null
  private quadBuffer: WebGLBuffer | null = null
  private framebuffer: WebGLFramebuffer | null = null
  private inputTexture: WebGLTexture | null = null
  private accumTexture: WebGLTexture | null = null
  private texW = 0
  private texH = 0

  private accAPos = -1
  private accUTex: WebGLUniformLocation | null = null
  private accUWeight: WebGLUniformLocation | null = null
  private blitAPos = -1
  private blitUTex: WebGLUniformLocation | null = null

  private activeSamples = 0
  private inProgress = false

  protected get eventSourceId(): string {
    return 'GPUMotionBlur'
  }

  /**
   * Begin an accumulation pass. Returns false when GPU is unavailable (caller
   * should fall back to the CPU trail renderer).
   */
  begin(w: number, h: number, sampleCount: number): boolean {
    if (!this.ensureInit()) return false
    if (this._contextLost) return false
    if (w === 0 || h === 0 || sampleCount < 1) return false

    const gl = this.gl!
    try {
      this.ensureSize(w, h)
      this.activeSamples = sampleCount

      // Clear the accumulation buffer and arm additive blending.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendEquation(gl.FUNC_ADD)
      gl.blendFunc(gl.ONE, gl.ONE)

      gl.useProgram(this.accumProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
      gl.enableVertexAttribArray(this.accAPos)
      gl.vertexAttribPointer(this.accAPos, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1f(this.accUWeight, 1 / sampleCount)
      gl.uniform1i(this.accUTex, 0)
      gl.activeTexture(gl.TEXTURE0)

      this.inProgress = true
      return true
    } catch (err) {
      this.emit('gpu:render-error', { op: 'motionBlur.begin', message: String(err) })
      return false
    }
  }

  /** Add one sub-frame sample to the accumulation buffer (weighted 1/N). */
  addSample(canvas: HTMLCanvasElement): void {
    if (!this.inProgress || this._contextLost) return
    const gl = this.gl!
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
      gl.viewport(0, 0, this.texW, this.texH)
      gl.bindTexture(gl.TEXTURE_2D, this.inputTexture)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    } catch (err) {
      this.emit('gpu:render-error', { op: 'motionBlur.addSample', message: String(err) })
    }
  }

  /**
   * Finish the pass: copy the averaged accumulation buffer to the GL canvas.
   * Returns the GL canvas (composite it like any effect output) or null.
   */
  finish(): HTMLCanvasElement | null {
    if (!this.inProgress || this._contextLost) {
      this.inProgress = false
      return null
    }
    const gl = this.gl!
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, this.texW, this.texH)
      gl.disable(gl.BLEND)
      gl.useProgram(this.blitProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
      gl.enableVertexAttribArray(this.blitAPos)
      gl.vertexAttribPointer(this.blitAPos, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1i(this.blitUTex, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.accumTexture)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.flush()

      this.emit('gpu:render-complete', { op: 'motionBlur', samples: this.activeSamples })
      return this.glCanvas
    } catch (err) {
      this.emit('gpu:render-error', { op: 'motionBlur.finish', message: String(err) })
      return null
    } finally {
      this.inProgress = false
    }
  }

  // ── Init / sizing ───────────────────────────────────────────────────────────────

  private ensureInit(): boolean {
    if (this.initialized) return this.available
    this.initialized = true

    const cap = gpuCapabilities.getReport()
    if (cap.tier === 'none') return false
    this.isGL2 = cap.tier === 'webgl2'

    const off = createWebGLOffscreen(1, 1, this.isGL2 ? 2 : 1)
    if (!off) return false
    this.glCanvas = off.canvas
    this.gl = off.gl

    try {
      this.glCanvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault()
        this._contextLost = true
        this.inProgress = false
        this.emit('gpu:context-lost')
      })
      this.glCanvas.addEventListener('webglcontextrestored', () => {
        try {
          this.buildResources()
          this.texW = 0
          this.texH = 0
          this._contextLost = false
          this.emit('gpu:context-restored')
        } catch (err) {
          this._contextLost = true
          this.emit('gpu:render-error', { phase: 'restore', message: String(err) })
        }
      })
      this.buildResources()
      this.available = true
      this.emit('gpu:backend-created', { tier: cap.tier, op: 'motion-blur' })
    } catch (err) {
      this.available = false
      this.emit('gpu:render-error', { phase: 'init', message: String(err) })
    }
    return this.available
  }

  private buildResources(): void {
    const gl = this.gl!
    const src = buildMotionBlurShaderSources(this.isGL2)
    this.accumProgram = this.buildProgram(src.vertex, src.accumulateFragment)
    this.blitProgram  = this.buildProgram(src.vertex, src.blitFragment)

    this.accAPos    = gl.getAttribLocation(this.accumProgram, 'a_pos')
    this.accUTex    = gl.getUniformLocation(this.accumProgram, 'u_tex')
    this.accUWeight = gl.getUniformLocation(this.accumProgram, 'u_weight')
    this.blitAPos   = gl.getAttribLocation(this.blitProgram, 'a_pos')
    this.blitUTex   = gl.getUniformLocation(this.blitProgram, 'u_tex')

    const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1])
    this.quadBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)

    this.inputTexture = this.createTexture()
    this.accumTexture = this.createTexture()
    this.framebuffer  = gl.createFramebuffer()
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl!
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private ensureSize(w: number, h: number): void {
    if (this.texW === w && this.texH === h) return
    const gl = this.gl!
    this.texW = w
    this.texH = h
    this.glCanvas!.width = w
    this.glCanvas!.height = h

    gl.bindTexture(gl.TEXTURE_2D, this.accumTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accumTexture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  // ── Shader compilation ────────────────────────────────────────────────────────

  private buildProgram(vsSrc: string, fsSrc: string): WebGLProgram {
    const gl = this.gl!
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSrc)
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSrc)
    const program = gl.createProgram()
    if (!program) throw new Error('[GPUMotionBlur] createProgram failed')
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      if (process.env.NODE_ENV !== 'production') console.warn('[GPUMotionBlur] link error:', log)
      throw new Error(`[GPUMotionBlur] link failed: ${log ?? 'unknown'}`)
    }
    return program
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl!
    const shader = gl.createShader(type)
    if (!shader) throw new Error('[GPUMotionBlur] createShader failed')
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      if (process.env.NODE_ENV !== 'production') console.warn('[GPUMotionBlur] shader error:', log)
      throw new Error(`[GPUMotionBlur] shader compile failed: ${log ?? 'unknown'}`)
    }
    return shader
  }
}

/** App-wide singleton — the motion-blur orchestrator drives this. */
export const gpuMotionBlur = new GPUMotionBlur()
