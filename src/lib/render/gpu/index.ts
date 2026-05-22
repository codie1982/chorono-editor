// ── GPU rendering subsystem ─────────────────────────────────────────────────────
// Shared GPU infrastructure. Used today by the 2D particle renderer; the future
// game-engine RendererWebGL will reuse the same capability detection, event
// surface, and backends.

export { gpuCapabilities, type GPUCapabilityReport, type GPUTier } from './GPUCapabilities'
export { GPUCompositor } from './GPUCompositor'
export {
  GPUEventEmitter,
  type GPUEvent,
  type GPUEventType,
  type GPUEventListener,
} from './GPUEvents'

export { ParticleGPUBackend, type GPUParticleDrawParams } from './particles/ParticleGPUBackend'
export { WebGLInstancedQuadBackend } from './particles/WebGLInstancedQuadBackend'
export { ParticleBufferPacker, FLOATS_PER_PARTICLE, shapeToId } from './particles/ParticleBufferPacker'
