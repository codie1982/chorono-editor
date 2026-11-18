import type { Layer } from '@/lib/types'
import type { Mesh2DAppearance, Mesh2DPinSelection } from '@/lib/types/mesh2d'

export type Mesh2DPinPreset = 'topEdge' | 'corners' | 'boundary'

/**
 * Returns a complete layer snapshot with a texture reference or solid fill.
 *
 * The operation does not load media and does not mutate UVs. Asset type and
 * existence are validated by the inspector/scene boundary because this pure
 * domain helper intentionally has no scene dependency.
 */
export function setMesh2DTexture(
  layer: Layer,
  textureAssetId: string | null,
  sampling: Mesh2DAppearance['sampling'] = layer.mesh2d?.appearance?.sampling ?? 'linear',
): Layer {
  if (layer.type !== 'mesh2d' || !layer.mesh2d) throw new Error('Expected a Mesh2D layer')
  const appearance: Mesh2DAppearance = textureAssetId
    ? { schemaVersion: 1, kind: 'texture', textureAssetId, sampling }
    : { schemaVersion: 1, kind: 'solid', sampling }
  return { ...layer, mesh2d: { ...layer.mesh2d, appearance } }
}

/**
 * Replaces the current pins with a validated stable-id selection.
 *
 * Unknown ids are rejected instead of being dropped, duplicates are removed in
 * topology order, and the current topology hash is captured atomically.
 */
export function setMesh2DPins(layer: Layer, vertexIds: readonly string[]): Layer {
  if (layer.type !== 'mesh2d' || !layer.mesh2d) throw new Error('Expected a Mesh2D layer')
  const topology = layer.mesh2d.geometry.topology
  const requested = new Set(vertexIds)
  for (const id of Array.from(requested)) {
    if (!topology.vertexIds.includes(id)) throw new Error(`Unknown Mesh2D vertex id: ${id}`)
  }
  const pins: Mesh2DPinSelection = {
    schemaVersion: 1,
    topologyHash: topology.topologyHash,
    vertexIds: topology.vertexIds.filter(id => requested.has(id)),
  }
  return { ...layer, mesh2d: { ...layer.mesh2d, pins } }
}

/** Returns whether selected pin ids belong to the layer's current topology. */
export function isMesh2DPinSelectionCurrent(layer: Layer): boolean {
  const mesh = layer.mesh2d
  if (layer.type !== 'mesh2d' || !mesh?.pins) return true
  if (mesh.pins.topologyHash !== mesh.geometry.topology.topologyHash) return false
  const current = new Set(mesh.geometry.topology.vertexIds)
  return mesh.pins.vertexIds.every(id => current.has(id))
}

/**
 * Selects a deterministic pin preset from current positions/connectivity.
 *
 * `topEdge` and `corners` use local-space extrema with a scale-relative
 * tolerance. `boundary` counts undirected triangle edges and selects vertices
 * incident to exactly one triangle. Degenerate or non-finite geometry returns
 * an empty selection through the same validated command path.
 */
export function selectMesh2DPinPreset(layer: Layer, preset: Mesh2DPinPreset): Layer {
  if (layer.type !== 'mesh2d' || !layer.mesh2d) throw new Error('Expected a Mesh2D layer')
  const { geometry } = layer.mesh2d
  const selected = preset === 'boundary'
    ? boundaryVertexIndices(geometry.topology.triangleIndices, geometry.topology.vertexIds.length)
    : extremumVertexIndices(geometry.positions, preset)
  return setMesh2DPins(layer, selected.map(index => geometry.topology.vertexIds[index]))
}

function extremumVertexIndices(positions: readonly number[], preset: Exclude<Mesh2DPinPreset, 'boundary'>): number[] {
  const points: Array<{ index: number; x: number; y: number }> = []
  for (let index = 0; index * 2 + 1 < positions.length; index++) {
    const x = positions[index * 2], y = positions[index * 2 + 1]
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ index, x, y })
  }
  if (!points.length) return []
  const xs = points.map(point => point.x), ys = points.map(point => point.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const tolerance = Math.max(maxX - minX, maxY - minY, 1) * 1e-6
  if (preset === 'topEdge') return points.filter(point => Math.abs(point.y - minY) <= tolerance).map(point => point.index)
  const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]] as const
  return Array.from(new Set(corners.map(([x, y]) => points.reduce((best, point) => {
    const distance = (point.x - x) ** 2 + (point.y - y) ** 2
    return distance < best.distance ? { index: point.index, distance } : best
  }, { index: points[0].index, distance: Infinity }).index)))
}

function boundaryVertexIndices(indices: readonly number[], vertexCount: number): number[] {
  const edges = new Map<string, { count: number; a: number; b: number }>()
  const add = (a: number, b: number) => {
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0 || a >= vertexCount || b >= vertexCount || a === b) return
    const lo = Math.min(a, b), hi = Math.max(a, b), key = `${lo}:${hi}`
    const old = edges.get(key)
    edges.set(key, old ? { ...old, count: old.count + 1 } : { count: 1, a: lo, b: hi })
  }
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = indices[offset], b = indices[offset + 1], c = indices[offset + 2]
    add(a, b); add(b, c); add(c, a)
  }
  const selected = new Set<number>()
  edges.forEach(edge => { if (edge.count === 1) { selected.add(edge.a); selected.add(edge.b) } })
  return Array.from(selected).sort((a, b) => a - b)
}
