import { GpuEffectBackend } from './GpuEffectBackend'
import { buildBlurShaderSources, MAX_BLUR_TAPS } from './GPUEffectShaders'
import { buildWebGLProgram, GpuAdmissionError } from '../resources'

/** Separable Gaussian blur with a budgeted two-texture workspace. Returned
 * canvas is borrowed until the next operation or current JS job ends. Hardware
 * failures preserve the CSS fallback; admission failures propagate explicitly.
 * Mutable shader state is private per backend; no source scene is retained. */
export class GPUImageEffects extends GpuEffectBackend {
  private program: WebGLProgram | null = null
  private aPos = -1
  private uTex: WebGLUniformLocation | null = null
  private uDir: WebGLUniformLocation | null = null
  private uRadius: WebGLUniformLocation | null = null
  private uSigma: WebGLUniformLocation | null = null
  protected get eventSourceId(): string { return 'GPUImageEffects' }

  /** Region planning probes hardware, not admission of an unknown target size. */
  supportsRegionBlur(): boolean { return this.ensureInit() }

  /** radiusPx is CSS-compatible sigma in backing pixels. Zero/empty input has
   * no blur result. Copy/composite before another backend operation or await. */
  blur(input: HTMLCanvasElement, radiusPx: number): HTMLCanvasElement | null {
    if (!this.ensureInit()) return null
    const radius = Math.max(0, radiusPx)
    if (radius === 0 || input.width === 0 || input.height === 0) return null
    const gl = this.gl
    try {
      this.prepare(input.width, input.height); this.upload(input)
      const sigma = Math.max(0.5, radius), taps = Math.min(MAX_BLUR_TAPS - 1, Math.ceil(radius * 3))
      gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
      gl.enableVertexAttribArray(this.aPos); gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1f(this.uRadius, taps); gl.uniform1f(this.uSigma, sigma)
      gl.disable(gl.BLEND); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.uTex, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer); gl.viewport(0, 0, this.texW, this.texH)
      gl.bindTexture(gl.TEXTURE_2D, this.inputTexture); gl.uniform2f(this.uDir, 1 / this.texW, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.texW, this.texH)
      gl.bindTexture(gl.TEXTURE_2D, this.targetTexture); gl.uniform2f(this.uDir, 0, 1 / this.texH)
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.flush(); this.recordDraws(2); this.emit('gpu:render-complete', { op: 'blur', radius, taps })
      return this.glCanvas
    } catch (error) {
      if (error instanceof GpuAdmissionError) throw error
      this.storage.clear(); this.emit('gpu:render-error', { op: 'blur', message: String(error) }); return null
    }
  }
  /** Rebuild only after storage destruction/native loss. */
  protected buildPrograms(): void {
    const gl = this.gl, source = buildBlurShaderSources(this.isGL2)
    this.program = buildWebGLProgram(gl, source.vertex, source.fragment)
    this.aPos = gl.getAttribLocation(this.program, 'a_pos')
    this.uTex = gl.getUniformLocation(this.program, 'u_tex'); this.uDir = gl.getUniformLocation(this.program, 'u_dir')
    this.uRadius = gl.getUniformLocation(this.program, 'u_radius'); this.uSigma = gl.getUniformLocation(this.program, 'u_sigma')
  }
  /** Idempotent, including partial initialization. */
  protected releasePrograms(): void { if (this.program) { this.gl.deleteProgram(this.program); this.program = null } }
}

/** App-wide backend; import creates no native context/storage. */
export const gpuImageEffects = new GPUImageEffects()
