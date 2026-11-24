import type { Mesh2DGeometry } from '../../../types/mesh2d'
import { MeshFaceTopology } from '../selection/MeshFaceTopology'
import type { MeshTopologyEdit } from './topologyEdit'

/** Snapshot stable logical IDs in the same orientation used by viewport picks.
 * The index order survives compaction because retained vertices stay ordered. */
function components(geometry: Mesh2DGeometry, legacyGrid?: MeshTopologyEdit['legacyGrid']) {
  const ids = geometry.topology.vertexIds
  const faces = new Map<string, readonly string[]>()
  const edges = new Map<string, readonly string[]>()
  for (const face of new MeshFaceTopology(geometry, legacyGrid).faces) {
    faces.set(
      face.id,
      face.vertices.map((index) => ids[index]),
    )
    face.vertices.forEach((a, i, loop) => {
      const b = loop[(i + 1) % loop.length]
      const pair = [ids[Math.min(a, b)], ids[Math.max(a, b)]]
      edges.set(JSON.stringify(pair), pair)
    })
  }
  return { vertices: new Set(ids), edges, faces }
}

/** Stable ID changes for an applied operation. An unchanged ID maps to itself
 * implicitly. A removed component maps to its replacement IDs or an empty
 * array. Fill only adds faces and any internal edges. No scene data is mutated. */
export function meshTopologyChanges(before: Mesh2DGeometry, after: Mesh2DGeometry, edit: MeshTopologyEdit) {
  const from = components(before, edit.legacyGrid),
    to = components(after)
  const removedFaces = Array.from(from.faces.keys()).filter((id) => !to.faces.has(id))
  const addedFaces = Array.from(to.faces.keys()).filter((id) => !from.faces.has(id))
  const removedEdges = Array.from(from.edges.keys()).filter((id) => !to.edges.has(id))
  const addedEdges = Array.from(to.edges.keys()).filter((id) => !from.edges.has(id))
  const removedVertices = Array.from(from.vertices).filter((id) => !to.vertices.has(id))
  const addedVertices = Array.from(to.vertices).filter((id) => !from.vertices.has(id))
  const faces = new Map<string, string[]>(),
    edges = new Map<string, string[]>()
  for (const id of removedFaces) {
    const parent = from.faces.get(id)!
    faces.set(
      id,
      edit.kind === 'flipEdge'
        ? addedFaces
        : edit.kind === 'splitEdge'
          ? addedFaces.filter((child) => to.faces.get(child)!.every((v) => v === edit.vertexId || parent.includes(v)))
          : [],
    )
  }
  for (const id of removedEdges) {
    const endpoints = from.edges.get(id)!
    edges.set(
      id,
      edit.kind === 'flipEdge'
        ? addedEdges
        : edit.kind === 'splitEdge'
          ? addedEdges.filter((edge) => to.edges.get(edge)!.every((v) => v === edit.vertexId || endpoints.includes(v)))
          : [],
    )
  }
  return {
    addedFaces,
    removedFaces,
    addedEdges,
    removedEdges,
    addedVertices,
    removedVertices,
    replacements: { vertices: new Map(removedVertices.map((id) => [id, [] as string[]])), edges, faces },
  }
}
