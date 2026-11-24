import type { Layer } from '@/lib/types'
import type { Mesh2DSource } from '@/lib/types/mesh2d'
import type { MeshComponentMode } from '@/lib/geometry/mesh2d/selection/MeshComponentSelection'

export const MESH_EDIT_LEVELS = [
  { mode: 'point', label: 'Vertex', key: '1' },
  { mode: 'edge', label: 'Edge', key: '2' },
  { mode: 'face', label: 'Face', key: '3' },
] as const

/** Transient panel/viewport selection report. Never persisted or put in Undo. */
export interface MeshSelectionSummary {
  readonly layerId: string
  readonly mode: MeshComponentMode
  readonly selected: number
  readonly vertices: number
  readonly edges: number
  readonly faces: number
  readonly quads: number
}

/** A legacy generator is a safe cell-layout hint only while current connectivity
 * still matches its retained source. Remeshing must use its explicit cell data.
 * Geometry is borrowed; no load-time migration or inferred triangle pairing. */
export function meshFaceSourceHint(layer: Layer): Mesh2DSource | undefined {
  const mesh = layer.mesh2d, source = layer.modifierStack?.source
  if (mesh?.source.kind === 'structuredGrid') return mesh.source
  if (mesh && source?.kind === 'mesh2d' && source.mesh.geometry.topology.topologyHash === mesh.geometry.topology.topologyHash)
    return source.mesh.source
  return undefined
}
