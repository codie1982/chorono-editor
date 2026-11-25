import type { Mesh2DGeometry } from '../../types/mesh2d'
import { meshTransformMatrix, type MeshTransformSettings } from './meshTransformSettings'
import { MeshModelingTopology } from '../../geometry/mesh2d/modeling/MeshModelingTopology'

export interface MeshVertexEdits { topologyHash: string; offsets: Array<[string, number, number]> }

/** Optional v1 Edit Mesh payload: stable vertex-id offsets AFTER the affine,
 * in local pixels. Connectivity hash excludes positions. Bounded, finite,
 * unique records only; no runtime buffers or selection state are persisted. */
export function readMeshVertexEdits(settings: Readonly<Record<string, unknown>>): MeshVertexEdits | undefined {
  const value = settings.vertexEdits
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Edit Mesh vertex offsets.')
  const { topologyHash, offsets } = value as Record<string, unknown>
  if (typeof topologyHash !== 'string' || !topologyHash || !Array.isArray(offsets) || offsets.length > MeshModelingTopology.maxVertices) throw new Error('Invalid Edit Mesh topology or offset budget.')
  const seen = new Set<string>()
  const records: MeshVertexEdits['offsets'] = offsets.map(record => {
    if (!Array.isArray(record) || record.length !== 3 || typeof record[0] !== 'string' || !record[0] || seen.has(record[0])
      || !record.slice(1).every(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e7)) throw new Error('Invalid or duplicate Edit Mesh vertex offset.')
    seen.add(record[0]); return [record[0], record[1], record[2]]
  })
  return { topologyHash, offsets: records }
}

/** Compose selected-vertex movement against the immutable displayed mesh.
 * Whole-mesh edits transform existing offsets as vectors after their affine;
 * subset edits add deltas only to the chosen IDs. Reject stale topology/IDs.
 * Ownership, topology validation, native history and tail-stage reuse stay in
 * the existing modifier command/evaluator. Neither input is mutated. */
export function accumulateMeshVertexEdits(previous: Readonly<Record<string, unknown>> | undefined,
  geometry: Mesh2DGeometry, delta: MeshTransformSettings, vertexIds?: readonly string[]): MeshVertexEdits | undefined {
  const edits = previous && readMeshVertexEdits(previous)
  if (edits && edits.topologyHash !== geometry.topology.topologyHash) throw new Error('Mesh topology changed. Reset vertex edits before continuing.')
  const matrix = meshTransformMatrix(delta)
  if (!vertexIds) return edits ? { ...edits, offsets: edits.offsets.map(([id, x, y]) => {
    const point = matrix.applyToVector({ x, y }); return [id, point.x, point.y]
  }) } : undefined
  const offsets = new Map(edits?.offsets.map(([id, x, y]) => [id, { x, y }]))
  const indices = new Map(geometry.topology.vertexIds.map((id, index) => [id, index]))
  for (const id of Array.from(new Set(vertexIds))) {
    const index = indices.get(id)
    if (index === undefined) throw new Error('A selected mesh vertex no longer exists.')
    const point = { x: geometry.positions[index * 2], y: geometry.positions[index * 2 + 1] }, next = matrix.applyToPoint(point)
    const old = offsets.get(id) ?? { x: 0, y: 0 }
    offsets.set(id, { x: old.x + next.x - point.x, y: old.y + next.y - point.y })
  }
  return { topologyHash: geometry.topology.topologyHash, offsets: Array.from(offsets, ([id, point]) => [id, point.x, point.y]) }
}
