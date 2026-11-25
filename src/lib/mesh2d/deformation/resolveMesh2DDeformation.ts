import type { Layer } from '@/lib/types'
import type { MeshDeformationClip } from './MeshDeformationClip'

export type Mesh2DDeformationStatus =
  | 'rest'
  | 'playing'
  | 'clipMissing'
  | 'topologyMismatch'
  | 'vertexCountMismatch'
  | 'invalidBinding'

export interface Mesh2DDeformationResolution {
  readonly status: Mesh2DDeformationStatus
  readonly positions?: Float32Array
}

/**
 * Resolves one layer's binary clip to frame-local x/y positions.
 *
 * Hash and vertex count must both match before sampling. Any unavailable,
 * stale or invalid binding returns an explicit status with no positions, which
 * tells the renderer to draw rest geometry. Source layer data and clip buffers
 * are never mutated.
 */
export function resolveMesh2DDeformation(
  layer: Layer,
  clip: MeshDeformationClip | undefined,
  compositionTimeMs: number,
): Mesh2DDeformationResolution {
  const mesh = layer.mesh2d, binding = mesh?.deformation
  if (layer.type !== 'mesh2d' || !mesh || !binding) return { status: 'rest' }
  if (!Number.isFinite(binding.startTimeMs) || !Number.isFinite(binding.playbackRate) || binding.playbackRate <= 0) {
    return { status: 'invalidBinding' }
  }
  if (!clip) return { status: 'clipMissing' }
  if (clip.topologyHash !== mesh.geometry.topology.topologyHash) return { status: 'topologyMismatch' }
  if (clip.vertexCount !== mesh.geometry.topology.vertexIds.length) return { status: 'vertexCountMismatch' }
  const localTimeMs = (compositionTimeMs - binding.startTimeMs) * binding.playbackRate
  return { status: 'playing', positions: clip.samplePositions(localTimeMs, binding.loop) }
}
