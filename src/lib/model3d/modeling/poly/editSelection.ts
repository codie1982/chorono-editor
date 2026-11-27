import type { MeshSnapshot } from './meshSnapshot'

export type PolySelectionMode = 'object' | 'vertex' | 'edge' | 'border' | 'polygon' | 'element'
/** View-local edit context. The fingerprint closes the context if Undo or a
 * source replacement changes the producer's logical connectivity. */
export interface PolyEditSelection { readonly objectId: string; readonly sourceFingerprint: string; readonly mode: PolySelectionMode; readonly ids: readonly string[] }
export interface PolyScreenPoint { readonly x: number; readonly y: number; readonly depth: number }
export interface PolyProjection { readonly vertices: Readonly<Record<string, PolyScreenPoint>>; readonly visibleFaces: readonly string[] }

/** IDs selected by a click remain view-local. Border selects a connected open
 * edge loop; Element selects the full connected face island. */
export function expandPolySelection(mesh: MeshSnapshot, mode: PolySelectionMode, id: string): readonly string[] {
  if (mode === 'element') {
    const faceId = id.startsWith('f') ? id : mesh.faces[0]?.id
    return elementForFace(mesh, faceId)
  }
  if (mode !== 'border') return [id]
  const boundary = mesh.edges.filter(edge => edge.halfEdgeIds.length === 1)
  const start = boundary.find(edge => edge.id === id)
  if (!start) return []
  const visited = new Set([start.id]), pending = [start]
  while (pending.length) {
    const edge = pending.pop()!
    for (const next of boundary) if (!visited.has(next.id) && next.vertices.some(vertex => edge.vertices.includes(vertex))) {
      visited.add(next.id); pending.push(next)
    }
  }
  return Array.from(visited)
}

/** Connected faces joined by authored mesh edges. */
export function elementForFace(mesh: MeshSnapshot, faceId: string): readonly string[] {
  const visited = new Set([faceId]), pending = [faceId]
  while (pending.length) {
    const current = pending.pop()!
    for (const edge of mesh.edges) {
      const faces = edge.halfEdgeIds.map(id => mesh.halfEdges.find(half => half.id === id)!.faceId)
      if (faces.includes(current)) for (const next of faces) if (!visited.has(next)) { visited.add(next); pending.push(next) }
    }
  }
  return Array.from(visited).filter(id => mesh.faces.some(face => face.id === id))
}

/** Compose replace/add/subtract selection without changing scene source. */
export function updatePolySelection(current: readonly string[], clicked: readonly string[], mode: 'replace' | 'add' | 'subtract'): readonly string[] {
  if (mode === 'replace') return Array.from(new Set(clicked))
  const values = new Set(current)
  for (const id of clicked) mode === 'add' ? values.add(id) : values.delete(id)
  return Array.from(values)
}
