import { GpuEffectBackend } from './GpuEffectBackend'
import { buildMotionBlurShaderSources } from './GPUEffectShaders'
import { buildWebGLProgram, GpuAdmissionError } from '../resources'

/** Streaming equal-weight RGBA8 accumulation. begin pins storage until
 * finish/cancel/failure, including across JS jobs. Output is borrowed for
 * synchronous composition. Admission fails explicitly; incomplete native
 * passes never publish a partial smear. Instances retain no source frames. */
export class GPUMotionBlur extends GpuEffectBackend {
  private accumProgram: WebGLProgram | null = null
  private blitProgram: WebGLProgram | null = null
  private accAPos = -1
  private accUTex: WebGLUniformLocation | null = null
  private accUWeight: WebGLUniformLocation | null = null
  private blitAPos = -1
  private blitUTex: WebGLUniformLocation | null = null
  private activeSamples = 0
  private receivedSamples = 0
  private inProgress = false
  private releasePass?: () => void
  protected get eventSourceId(): string { return 'GPUMotionBlur' }

  /** Start/reset a positive integer sample pass at backing-pixel dimensions.
   * false means hardware/native failure; admission failures are thrown. */
  begin(w: number, h: number, sampleCount: number): boolean {
    this.cancel()
    if (!this.ensureInit() || w === 0 || h === 0 || !Number.isSafeInteger(sampleCount) || sampleCount < 1) return false
    const gl = this.gl
    try {
      this.prepare(w, h); this.releasePass = this.storage.hold(); this.activeSamples = sampleCount
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer); gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE)
      gl.useProgram(this.accumProgram); gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
      gl.enableVertexAttribArray(this.accAPos); gl.vertexAttribPointer(this.accAPos, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1f(this.accUWeight, 1 / sampleCount); gl.uniform1i(this.accUTex, 0); gl.activeTexture(gl.TEXTURE0)
      this.receivedSamples = 0; this.inProgress = true; return true
    } catch (error) {
      this.cancel()
      if (error instanceof GpuAdmissionError) throw error
      this.storage.clear(); this.emit('gpu:render-error', { op: 'motionBlur.begin', message: String(error) }); return false
    }
  }
  /** One same-size premultiplied sample at weight 1/N. Failure invalidates the
   * entire pass; finish then returns null for the existing fallback. */
  addSample(canvas: HTMLCanvasElement): void {
    if (!this.inProgress || this.contextLost) return
    const gl = this.gl
    try {
      this.upload(canvas); gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
      gl.viewport(0, 0, this.texW, this.texH); gl.drawArrays(gl.TRIANGLES, 0, 6); this.recordDraws(1); this.receivedSamples++
    } catch (error) {
      this.cancel(); this.storage.clear(); this.emit('gpu:render-error', { op: 'motionBlur.addSample', message: String(error) })
    }
  }
  /** Copy average to the default canvas. Job protection survives pass release
   * through synchronous composition, including intervening budget allocations. */
  finish(): HTMLCanvasElement | null {
    if (!this.inProgress || this.contextLost || this.receivedSamples !== this.activeSamples) { this.cancel(); return null }
    const gl = this.gl
    try {
      this.prepare(this.texW, this.texH)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.texW, this.texH)
      gl.disable(gl.BLEND); gl.useProgram(this.blitProgram); gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
      gl.enableVertexAttribArray(this.blitAPos); gl.vertexAttribPointer(this.blitAPos, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1i(this.blitUTex, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.targetTexture)
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.flush(); this.recordDraws(1); this.emit('gpu:render-complete', { op: 'motionBlur', samples: this.activeSamples })
      return this.glCanvas
    } catch (error) {
      if (error instanceof GpuAdmissionError) throw error
      this.storage.clear(); this.emit('gpu:render-error', { op: 'motionBlur.finish', message: String(error) }); return null
    } finally { this.cancel() }
  }
  /** Abort without publishing output; idle grace keeps reusable storage.
   * Idempotent and safe from renderer finally/context-loss handlers. */
  cancel(): void { this.inProgress = false; this.releasePass?.(); this.releasePass = undefined }
  protected onStorageLost(): void { this.cancel() }

  /** Compiler owns temporary shaders; backend owns the linked programs. */
  protected buildPrograms(): void {
    const gl = this.gl, source = buildMotionBlurShaderSources(this.isGL2)
    this.accumProgram = buildWebGLProgram(gl, source.vertex, source.accumulateFragment)
    this.blitProgram = buildWebGLProgram(gl, source.vertex, source.blitFragment)
    this.accAPos = gl.getAttribLocation(this.accumProgram, 'a_pos')
    this.accUTex = gl.getUniformLocation(this.accumProgram, 'u_tex'); this.accUWeight = gl.getUniformLocation(this.accumProgram, 'u_weight')
    this.blitAPos = gl.getAttribLocation(this.blitProgram, 'a_pos'); this.blitUTex = gl.getUniformLocation(this.blitProgram, 'u_tex')
  }
  /** Clear each field after successful deletion for partial-cleanup retries. */
  protected releasePrograms(): void {
    if (this.accumProgram) { this.gl.deleteProgram(this.accumProgram); this.accumProgram = null }
    if (this.blitProgram) { this.gl.deleteProgram(this.blitProgram); this.blitProgram = null }
  }
}

/** App-wide backend; ownership is independent of viewport lifetime. */
export const gpuMotionBlur = new GPUMotionBlur()
