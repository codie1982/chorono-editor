// ── GPUCapabilities ─────────────────────────────────────────────────────────────
//
// SSR-safe singleton that probes the browser's WebGL support exactly once and
// caches a rich capability report. Backends read this to decide whether they can
// run and which code paths to take (native instancing vs ANGLE extension,
// fwidth anti-alias vs constant fallback, etc.).
//
// The probe never throws: in SSR (no `document`) or when WebGL is unavailable it
// returns a 'none' tier so callers transparently fall back to Canvas 2D.

import { GPUEventEmitter } from './GPUEvents'

export type GPUTier = 'webgl2' | 'webgl1' | 'none'

export interface GPUCapabilityReport {
  tier:                        GPUTier
  /** gl.ALIASED_POINT_SIZE_RANGE[1] — max gl_PointSize the driver allows. */
  maxPointSize:                number
  maxTextureSize:              number
  /** WebGL2 native, or WebGL1 with ANGLE_instanced_arrays. */
  supportsInstancing:          boolean
  /** WebGL2 core fwidth, or WebGL1 with OES_standard_derivatives. */
  supportsStandardDerivatives: boolean
  supportsLoseContext:         boolean
  /** WebGL2 native VAO, or WebGL1 with OES_vertex_array_object. */
  supportsVertexArrayObject:   boolean
  /** Unmasked GPU model when WEBGL_debug_renderer_info is present. */
  renderer:                    string
}

const EMPTY_REPORT: GPUCapabilityReport = {
  tier:                        'none',
  maxPointSize:                0,
  maxTextureSize:              0,
  supportsInstancing:          false,
  supportsStandardDerivatives: false,
  supportsLoseContext:         false,
  supportsVertexArrayObject:   false,
  renderer:                    '',
}

class GPUCapabilities extends GPUEventEmitter {
  private report: GPUCapabilityReport | null = null

  protected get eventSourceId(): string {
    return 'GPUCapabilities'
  }

  /** Probes once, then returns the cached report. */
  getReport(): GPUCapabilityReport {
    if (this.report) return this.report
    this.report = this.probe()
    this.emit('gpu:probe-complete', { tier: this.report.tier, renderer: this.report.renderer })
    return this.report
  }

  supportsGPUParticles(): boolean {
    return this.getReport().tier !== 'none'
  }

  private probe(): GPUCapabilityReport {
    if (typeof document === 'undefined') return { ...EMPTY_REPORT }

    let canvas: HTMLCanvasElement
    try {
      canvas = document.createElement('canvas')
    } catch {
      return { ...EMPTY_REPORT }
    }

    const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null
    if (gl2) return this.buildReport(gl2, 'webgl2')

    const gl1 = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (gl1) return this.buildReport(gl1, 'webgl1')

    return { ...EMPTY_REPORT }
  }

  private buildReport(
    gl:   WebGL2RenderingContext | WebGLRenderingContext,
    tier: GPUTier,
  ): GPUCapabilityReport {
    const isGL2 = tier === 'webgl2'

    const pointRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null
    const maxTexture = (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) ?? 0

    const instExt   = isGL2 ? true : !!gl.getExtension('ANGLE_instanced_arrays')
    const derivExt  = isGL2 ? true : !!gl.getExtension('OES_standard_derivatives')
    const vaoExt    = isGL2 ? true : !!gl.getExtension('OES_vertex_array_object')
    const loseExt   = !!gl.getExtension('WEBGL_lose_context')

    let renderer = ''
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '')

    return {
      tier,
      maxPointSize:                pointRange ? pointRange[1] : 0,
      maxTextureSize:              maxTexture,
      supportsInstancing:          instExt,
      supportsStandardDerivatives: derivExt,
      supportsLoseContext:         loseExt,
      supportsVertexArrayObject:   vaoExt,
      renderer,
    }
  }
}

/** App-wide singleton — backends and the particle plugin read from this. */
export const gpuCapabilities = new GPUCapabilities()
