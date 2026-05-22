// ── GPUImageEffects ─────────────────────────────────────────────────────────────
//
// Shared GPU image-processing engine for layer post-effects. V1 exposes a
// high-quality separable Gaussian blur — the dominant cost shared by the blur,
// glow, and shadow effects. The cheap tint/composite steps stay on Canvas 2D in
// the effect plugins; only the blur (the expensive part) runs on the GPU here.
//
// blur(input, radius):
//   1. upload `input` → texture (premultiplied, so edges stay halo-free)
//   2. horizontal Gaussian pass → intermediate FBO texture
//   3. vertical Gaussian pass → the GL canvas (returned)
//
// Returns null when GPU is unavailable or the context is lost, so callers fall
// back to the CSS-filter blur transparently. Singleton, lazily initialized.

import { GPUEventEmitter } from '../GPUEvents'
import { gpuCapabilities } from '../GPUCapabilities'
import { createWebGLOffscreen } from '../../OffscreenCanvasCache'
import { buildBlurShaderSources, MAX_BLUR_TAPS } from './GPUEffectShaders'

class GPUImageEffects extends GPUEventEmitter {
  private initialized = false
  private available   = false
  private isGL2 = false
  private _contextLost = false
  private glCanvas: HTMLCanvasElement | null = null
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null

  private program: WebGLProgram | null = null
  private quadBuffer: WebGLBuffer | null = null
  private framebuffer: WebGLFramebuffer | null = null
  private inputTexture: WebGLTexture | null = null
  private interTexture: WebGLTexture | null = null
  private texW = 0
  private texH = 0

  private aPos = -1
  private uTex: WebGLUniformLocation | null = null
  private uDir: WebGLUniformLocation | null = null
  private uRadius: WebGLUniformLocation | null = null
  private uSigma: WebGLUniformLocation | null = null

  protected get eventSourceId(): string {
    return 'GPUImageEffects'
  }

  /**
   * GPU separable Gaussian blur. Returns the GL canvas with the blurred result,
   * or null when unavailable (caller should fall back to a CSS-filter blur).
   * sigma matches the CSS blur(radius) convention (stddev ≈ radius).
   */
  blur(input: HTMLCanvasElement, radiusPx: number): HTMLCanvasElement | null {
    if (!this.ensureInit()) return null
    if (this._contextLost) return null
    const gl = this.gl!
    const radius = Math.max(0, radiusPx)
    if (radius === 0 || input.width === 0 || input.height === 0) return null

    try {
      this.ensureSize(input.width, input.height)

      const sigma = Math.max(0.5, radius)
      const taps  = Math.min(MAX_BLUR_TAPS - 1, Math.ceil(radius * 3))

      // Upload input as a premultiplied, flipped texture.
      gl.bindTexture(gl.TEXTURE_2D, this.inputTexture)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)

      gl.useProgram(this.program)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
      gl.enableVertexAttribArray(this.aPos)
      gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1f(this.uRadius, taps)
      gl.uniform1f(this.uSigma, sigma)
      gl.disable(gl.BLEND)
      gl.activeTexture(gl.TEXTURE0)
      gl.uniform1i(this.uTex, 0)

      // ── Pass 1: horizontal → intermediate FBO texture ──
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer as WebGLFramebuffer)
      gl.viewport(0, 0, this.texW, this.texH)
      gl.bindTexture(gl.TEXTURE_2D, this.inputTexture)
      gl.uniform2f(this.uDir, 1 / this.texW, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      // ── Pass 2: vertical → GL canvas (default framebuffer) ──
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, this.texW, this.texH)
      gl.bindTexture(gl.TEXTURE_2D, this.interTexture)
      gl.uniform2f(this.uDir, 0, 1 / this.texH)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      gl.flush()
      this.emit('gpu:render-complete', { op: 'blur', radius, taps })
      return this.glCanvas
    } catch (err) {
      this.emit('gpu:render-error', { op: 'blur', message: String(err) })
      return null
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
      this.emit('gpu:backend-created', { tier: cap.tier, op: 'image-effects' })
    } catch (err) {
      this.available = false
      this.emit('gpu:render-error', { phase: 'init', message: String(err) })
    }
    return this.available
  }

  private buildResources(): void {
    const gl = this.gl!
    const src = buildBlurShaderSources(this.isGL2)
    this.program = this.buildProgram(src.vertex, src.fragment)

    this.aPos    = gl.getAttribLocation(this.program, 'a_pos')
    this.uTex    = gl.getUniformLocation(this.program, 'u_tex')
    this.uDir    = gl.getUniformLocation(this.program, 'u_dir')
    this.uRadius = gl.getUniformLocation(this.program, 'u_radius')
    this.uSigma  = gl.getUniformLocation(this.program, 'u_sigma')

    const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1])
    this.quadBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)

    this.inputTexture = this.createTexture()
    this.interTexture = this.createTexture()
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

    // Intermediate render-target texture (empty allocation).
    gl.bindTexture(gl.TEXTURE_2D, this.interTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer as WebGLFramebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.interTexture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  // ── Shader compilation ────────────────────────────────────────────────────────

  private buildProgram(vsSrc: string, fsSrc: string): WebGLProgram {
    const gl = this.gl!
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSrc)
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSrc)
    const program = gl.createProgram()
    if (!program) throw new Error('[GPUImageEffects] createProgram failed')
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      if (process.env.NODE_ENV !== 'production') console.warn('[GPUImageEffects] link error:', log)
      throw new Error(`[GPUImageEffects] link failed: ${log ?? 'unknown'}`)
    }
    return program
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl!
    const shader = gl.createShader(type)
    if (!shader) throw new Error('[GPUImageEffects] createShader failed')
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      if (process.env.NODE_ENV !== 'production') console.warn('[GPUImageEffects] shader error:', log)
      throw new Error(`[GPUImageEffects] shader compile failed: ${log ?? 'unknown'}`)
    }
    return shader
  }
}

/** App-wide singleton — effect plugins call gpuImageEffects.blur(...). */
export const gpuImageEffects = new GPUImageEffects()
