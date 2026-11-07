// ── ParticleGPUBackend ──────────────────────────────────────────────────────────
//
// Abstract base for GPU particle renderers (coding_standards_oop: abstract base
// first). A backend owns its own offscreen WebGL canvas, renders the supplied
// particles into it, and exposes that canvas for GPUCompositor to blit onto the
// destination 2D context.
//
// Concrete backends: WebGLInstancedQuadBackend (V1). A point-sprite backend can
// be added later for WebGL1 hardware without ANGLE_instanced_arrays.

import { GPUEventEmitter } from '../GPUEvents'
import type { DisplayTransform } from '../../resolveDisplayTransform'
import type { ParticleInstance } from '@/lib/particles/runtime/ParticleInstance'
import type { ParticleEmitterData } from '@/lib/particles/types'

/** Canvas-compatible layer-local → backing-pixel affine transform. */
export interface ParticleBackingTransform {
  a: number; b: number; c: number; d: number; e: number; f: number
}

export interface GPUParticleDrawParams {
  /** Alive, already-evaluated particles for this frame. */
  instances:        ParticleInstance[]
  cfg:              ParticleEmitterData
  /** timeMs - layerStartMs, used by the packer's isAlive guard. */
  relativeTime:     number
  /** Logical composition size (drives the ortho projection). */
  compositionW:     number
  compositionH:     number
  /** Destination canvas backing-store size (drives the GL canvas resolution). */
  backingW:         number
  backingH:         number
  /** Accumulated layer alpha at the call site (baked into per-particle opacity). */
  layerAlpha:       number
  /** Complete canvas basis, including parent/repeater transforms, zoom and
   * device pixel ratio. Preferred over the legacy composition transform. */
  localToBacking?: ParticleBackingTransform
  /** Resolved layer transform (keyframes + motion path already applied). */
  displayTransform: DisplayTransform
  anchorX:          number
  anchorY:          number
}

export abstract class ParticleGPUBackend extends GPUEventEmitter {
  protected _contextLost = false

  /** True after a webglcontextlost event until restoration succeeds. */
  get contextLost(): boolean {
    return this._contextLost
  }

  /** Render particles into the backend's GL canvas. Returns false on failure. */
  abstract draw(params: GPUParticleDrawParams): boolean

  /** The offscreen GL canvas to composite onto the destination 2D context. */
  abstract get canvas(): HTMLCanvasElement

  /** Release all GPU resources. */
  abstract dispose(): void
}
