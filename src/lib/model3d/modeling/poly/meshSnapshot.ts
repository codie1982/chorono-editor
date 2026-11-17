import type { ModelVector } from '../../content/types'
import type { PrimitiveGeometry } from './primitiveSource'

export interface MeshVertex { readonly id: string; readonly position: ModelVector; readonly outgoingHalfEdgeId?: string }
export interface MeshCorner { readonly halfEdgeId: string; readonly vertexId: string; readonly uv: readonly [number, number]; readonly normal: ModelVector }
export interface MeshFace { readonly id: string; readonly outerHalfEdgeId: string; readonly corners: readonly MeshCorner[] }
export interface MeshHalfEdge { readonly id: string; readonly edgeId: string; readonly faceId: string; readonly from: string; readonly to: string; readonly nextId: string; readonly prevId: string; readonly twinId?: string }
export interface MeshEdge { readonly id: string; readonly vertices: readonly [string, string]; readonly halfEdgeIds: readonly string[] }
/** Immutable local-metre edit topology. Corner attributes belong to faces;
 * triangles used by the GPU are deliberately absent from editable edges. */
export interface MeshSnapshot { readonly vertices: readonly MeshVertex[]; readonly edges: readonly MeshEdge[]; readonly faces: readonly MeshFace[]; readonly halfEdges: readonly MeshHalfEdge[] }
/** v4 sources have an implicit v1 generator because their schema predates the
 * field. A future changed algorithm must use a new source/generator version. */
export const PRIMITIVE_MESH_GENERATOR_VERSION = 1
export interface PrimitiveMeshSnapshot extends MeshSnapshot {
  readonly generatorVersion: typeof PRIMITIVE_MESH_GENERATOR_VERSION
  readonly sourceKind: PrimitiveGeometry['kind']
}

/** Build deterministic logical topology from a parametric primitive. Segment
 * counts are fixed at 24 around and 16 high for this first authoring slice.
 * IDs depend on topology indices, not dimensions, so resizing retains picks. */
export function primitiveMeshSnapshot(geometry: PrimitiveGeometry): PrimitiveMeshSnapshot {
  const positions: ModelVector[] = [], loops: number[][] = []
  const vertex = (x: number, y: number, z: number) => { positions.push({ x, y, z }); return positions.length - 1 }
  if (geometry.kind === 'box') {
    const x = geometry.width / 2, y = geometry.height / 2, z = geometry.depth / 2
    vertex(-x, -y, -z); vertex(x, -y, -z); vertex(x, y, -z); vertex(-x, y, -z)
    vertex(-x, -y, z); vertex(x, -y, z); vertex(x, y, z); vertex(-x, y, z)
    loops.push([4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4])
  } else if (geometry.kind === 'plane') {
    const x = geometry.width / 2, z = geometry.depth / 2
    vertex(-x, 0, -z); vertex(x, 0, -z); vertex(x, 0, z); vertex(-x, 0, z)
    loops.push([0, 3, 2, 1])
  } else if (geometry.kind === 'sphere') {
    const top = vertex(0, geometry.radius, 0), rings: number[][] = []
    for (let j = 1; j < 16; j++) {
      const theta = Math.PI * j / 16, ring: number[] = []
      for (let i = 0; i < 24; i++) { const a = 2 * Math.PI * i / 24; ring.push(vertex(geometry.radius * Math.sin(theta) * Math.cos(a), geometry.radius * Math.cos(theta), geometry.radius * Math.sin(theta) * Math.sin(a))) }
      rings.push(ring)
    }
    const bottom = vertex(0, -geometry.radius, 0)
    for (let i = 0; i < 24; i++) loops.push([top, rings[0][(i + 1) % 24], rings[0][i]])
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < 24; i++) loops.push([rings[j][(i + 1) % 24], rings[j + 1][(i + 1) % 24], rings[j + 1][i], rings[j][i]])
    for (let i = 0; i < 24; i++) loops.push([rings.at(-1)![(i + 1) % 24], bottom, rings.at(-1)![i]])
  } else {
    const top: number[] = [], bottom: number[] = [], h = geometry.height / 2
    const apex = geometry.kind === 'cone' ? vertex(0, h, 0) : -1
    for (let i = 0; i < 24; i++) {
      const a = 2 * Math.PI * i / 24, x = geometry.radius * Math.cos(a), z = geometry.radius * Math.sin(a)
      if (geometry.kind === 'cylinder') top.push(vertex(x, h, z))
      bottom.push(vertex(x, -h, z))
    }
    for (let i = 0; i < 24; i++) {
      const next = (i + 1) % 24
      loops.push(geometry.kind === 'cone' ? [apex, bottom[next], bottom[i]] : [top[next], bottom[next], bottom[i], top[i]])
    }
    if (geometry.kind === 'cylinder') loops.push([...top].reverse())
    loops.push([...bottom])
  }
  let halfEdgeOffset = 0
  const faces: MeshFace[] = loops.map((loop, index) => {
    const [a, b, c] = loop.map(i => positions[i])
    const u = subtract(b, a), v = subtract(c, a), normal = normalize(cross(u, v))
    const uAxis = normalize(u), vAxis = cross(normal, uAxis)
    const start = halfEdgeOffset; halfEdgeOffset += loop.length
    return { id: `f${index}`, outerHalfEdgeId: `h${start}`,
      corners: loop.map((i, corner) => {
        const delta = subtract(positions[i], a)
        const point = positions[i]
        const cornerNormal = geometry.kind === 'sphere' ? normalize(point)
          : geometry.kind === 'cylinder' && index < 24 ? normalize({ x: point.x, y: 0, z: point.z })
            : geometry.kind === 'cone' && index < 24 && i !== 0
              ? normalize({ x: point.x, y: geometry.radius * geometry.radius / geometry.height, z: point.z }) : normal
        return { halfEdgeId: `h${start + corner}`, vertexId: `v${i}`,
          uv: [dot(delta, uAxis), dot(delta, vAxis)] as const, normal: cornerNormal }
      }) }
  })
  const pending: { id: string; edgeId: string; faceId: string; from: string; to: string; nextId: string; prevId: string }[] = []
  const edgeIndex = new Map<string, { id: string; vertices: [string, string]; halfEdgeIds: string[] }>()
  for (const face of faces) face.corners.forEach((corner, i) => {
    const from = corner.vertexId, to = face.corners[(i + 1) % face.corners.length].vertexId
    const key = [from, to].sort().join('/'); let edge = edgeIndex.get(key)
    if (!edge) { edge = { id: `e${edgeIndex.size}`, vertices: [from, to], halfEdgeIds: [] }; edgeIndex.set(key, edge) }
    const id = corner.halfEdgeId; edge.halfEdgeIds.push(id); pending.push({ id, edgeId: edge.id, faceId: face.id, from, to,
      nextId: face.corners[(i + 1) % face.corners.length].halfEdgeId,
      prevId: face.corners[(i + face.corners.length - 1) % face.corners.length].halfEdgeId })
  })
  const halfEdges: MeshHalfEdge[] = pending.map(half => {
    const twin = pending.find(other => other.edgeId === half.edgeId && other.from === half.to && other.to === half.from)
    return { ...half, twinId: twin?.id }
  })
  const edges = Array.from(edgeIndex.values())
  const vertices: MeshVertex[] = positions.map((position, i) => ({ id: `v${i}`, position,
    outgoingHalfEdgeId: pending.find(half => half.from === `v${i}`)?.id }))
  return { generatorVersion: PRIMITIVE_MESH_GENERATOR_VERSION, sourceKind: geometry.kind, vertices, faces, edges, halfEdges }
}

/** Open boundary edges; a closed solid has none. */
export function meshBorderEdges(mesh: MeshSnapshot): readonly MeshEdge[] { return mesh.edges.filter(edge => edge.halfEdgeIds.length === 1) }

/** Connected face islands through shared edges, independent of triangulation. */
export function meshElements(mesh: MeshSnapshot): readonly (readonly string[])[] {
  const adjacent = new Map(mesh.faces.map(face => [face.id, new Set<string>()]))
  for (const edge of mesh.edges) if (edge.halfEdgeIds.length === 2) {
    const a = mesh.halfEdges.find(half => half.id === edge.halfEdgeIds[0])!.faceId
    const b = mesh.halfEdges.find(half => half.id === edge.halfEdgeIds[1])!.faceId
    adjacent.get(a)!.add(b); adjacent.get(b)!.add(a)
  }
  const seen = new Set<string>(), elements: string[][] = []
  for (const face of mesh.faces) {
    if (seen.has(face.id)) continue
    const pending = [face.id], island: string[] = []; seen.add(face.id)
    while (pending.length) { const id = pending.pop()!; island.push(id); for (const next of Array.from(adjacent.get(id)!)) if (!seen.has(next)) { seen.add(next); pending.push(next) } }
    elements.push(island)
  }
  return elements
}

function subtract(a: ModelVector, b: ModelVector): ModelVector { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z } }
function cross(a: ModelVector, b: ModelVector): ModelVector { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x } }
function dot(a: ModelVector, b: ModelVector): number { return a.x * b.x + a.y * b.y + a.z * b.z }
function normalize(v: ModelVector): ModelVector { const n = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n } }
