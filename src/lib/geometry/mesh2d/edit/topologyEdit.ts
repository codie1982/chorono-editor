import cdt2d from 'cdt2d'
import { meshTopologyChanges } from './topologyChanges'
import type { Mesh2DGeometry, Mesh2DSource } from '../../../types/mesh2d'
import { MeshFaceTopology, meshEdgeKey, type MeshEditFace } from '../selection/MeshFaceTopology'
import { Mesh2DTopologyHasher } from '../Mesh2DTopologyHasher'
import { Mesh2DBoundaryRingExtractor } from '../Mesh2DBoundaryRingExtractor'
import { MeshModelingTopology } from '../modeling/MeshModelingTopology'
import { computeMesh2DLocalBounds } from '../Mesh2DGeometryQueries'

export type MeshToolKind = 'deleteFace' | 'splitEdge' | 'flipEdge' | 'fill'
export interface MeshTopologyEdit {
  kind: MeshToolKind
  ids: readonly string[]
  topologyHash: string
  t?: number
  vertexId?: string
  legacyGrid?: Extract<Mesh2DSource, { kind: 'structuredGrid' }>
}

/** Resolve a picked logical edge by its ordered vertex IDs. This preserves the
 * direction used for the cursor parameter, even on the opposite incident face. */
function edgeVertices(ids: readonly string[], selection: readonly string[]) {
  if (selection.length !== 1) throw new Error('Select one mesh edge.')
  const pair: unknown = JSON.parse(selection[0])
  if (!Array.isArray(pair) || pair.length !== 2) throw new Error('Invalid mesh edge.')
  const [a, b] = pair.map((id) => ids.indexOf(id))
  if (a < 0 || b < 0 || a === b) throw new Error('The selected edge no longer exists.')
  return [a, b]
}

/** Ordered closed boundary, rotated so the first two vertices form this edge. */
function incident(face: MeshEditFace, a: number, b: number) {
  const v = face.vertices
  const i = v.findIndex((p, j) => (p === a && v[(j + 1) % v.length] === b) || (p === b && v[(j + 1) % v.length] === a))
  return i < 0 ? null : [...v.slice(i), ...v.slice(0, i)]
}

/** Positive signed double area in local px², consistent with the Mesh validator. */
function area(pos: readonly number[], a: number, b: number, c: number) {
  return (
    (pos[b * 2] - pos[a * 2]) * (pos[c * 2 + 1] - pos[a * 2 + 1]) -
    (pos[b * 2 + 1] - pos[a * 2 + 1]) * (pos[c * 2] - pos[a * 2])
  )
}

/** Fill one complete hole with constrained triangles using the existing boundary
 * indices, including any contained material islands as exclusion constraints. */
function fillHole(input: Mesh2DGeometry, selection: ReadonlySet<string>): number[][] {
  const rings = new Mesh2DBoundaryRingExtractor().extract(input)
  const ids = input.topology.vertexIds
  const index = rings.findIndex(
    (r) =>
      r.role === 'hole' &&
      selection.size === r.vertexIndices.length &&
      r.vertexIndices.every((a, i) => {
        const b = r.vertexIndices[(i + 1) % r.vertexIndices.length]
        return selection.has(JSON.stringify([ids[Math.min(a, b)], ids[Math.max(a, b)]]))
      }),
  )
  if (index < 0) throw new Error('Select all boundary edges of one hole.')
  const boundary = [...rings[index].vertexIndices].reverse()
  const start = boundary.indexOf(Math.min(...boundary))
  const loop = [...boundary.slice(start), ...boundary.slice(0, start)]
  const islands = rings.filter((r) => r.parentIndex === index)
  if (
    !islands.length &&
    loop.length === 4 &&
    loop.every((a, i) => area(input.positions, a, loop[(i + 1) % 4], loop[(i + 2) % 4]) > 1e-8)
  )
    return [loop]
  const points: [number, number][] = [],
    edges: [number, number][] = [],
    indices: number[] = []
  for (const boundary of [loop, ...islands.map((r) => r.vertexIndices)]) {
    const start = points.length
    boundary.forEach((v, i) => {
      points.push([input.positions[2 * v], input.positions[2 * v + 1]])
      indices.push(v)
      edges.push([start + i, start + ((i + 1) % boundary.length)])
    })
  }
  return cdt2d(points, edges, { delaunay: true, interior: true, exterior: false }).map((tri) => {
    const [a, b, c] = tri.map((i) => indices[i])
    return area(input.positions, a, b, c) > 0 ? [a, b, c] : [a, c, b]
  })
}

/** Apply a single authored operation to an immutable local-pixel mesh. Returns
 * a new validated mesh and the affected logical IDs. A split ID is assigned by
 * the command before persistence, so replay and Undo/Redo agree. UVs follow
 * the same edge parameter. Other faces retain their vertex IDs and diagonal. */
export function editMeshTopology(input: Mesh2DGeometry, edit: MeshTopologyEdit) {
  if (edit.topologyHash !== input.topology.topologyHash)
    throw new Error('Mesh topology changed. Select the components again.')
  const topology = new MeshModelingTopology()
  const faces = new MeshFaceTopology(input, edit.legacyGrid).faces
  const selection = new Set(edit.ids),
    removed = new Set<string>(),
    added: number[][] = []
  const ids = [...input.topology.vertexIds],
    positions = [...input.positions],
    uvs = [...input.uvs]
  if (!selection.size) throw new Error('Select mesh components first.')
  if (edit.kind === 'deleteFace') {
    for (const f of faces) if (selection.has(f.id)) removed.add(f.id)
    if (removed.size !== selection.size) throw new Error('A selected face no longer exists.')
    if (removed.size === faces.length) throw new Error('Use Layer mode to delete the whole mesh.')
  } else if (edit.kind === 'fill') {
    added.push(...fillHole(input, selection))
  } else if (edit.kind === 'splitEdge' || edit.kind === 'flipEdge') {
    const [a, b] = edgeVertices(ids, edit.ids)
    const originalDiagonals = new Set<string>()
    const sides = faces.flatMap((f) => {
      const loop = incident(f, a, b)
      if (!loop) return []
      removed.add(f.id)
      if (f.kind === 'quad') originalDiagonals.add(meshEdgeKey(f.vertices[0], f.vertices[2]))
      return [loop]
    })
    if (!sides.length || sides.length > 2) throw new Error('Select a visible manifold edge.')
    if (edit.kind === 'splitEdge') {
      const t = edit.t ?? 0.5,
        m = ids.length
      if (!Number.isFinite(t) || t <= 0 || t >= 1 || !edit.vertexId || ids.includes(edit.vertexId))
        throw new Error('Split must create a new point inside the edge.')
      ids.push(edit.vertexId)
      for (const buffer of [positions, uvs])
        for (let k = 0; k < 2; k++) buffer.push(buffer[2 * a + k] * (1 - t) + buffer[2 * b + k] * t)
      for (const [p, q, r, s] of sides) {
        if (s === undefined) added.push([m, q, r], [p, m, r])
        else if (originalDiagonals.has(meshEdgeKey(p, r))) added.push([m, q, r], [p, m, r, s])
        else added.push([p, m, s], [q, r, s, m])
      }
    } else {
      if (sides.length !== 2 || sides.some((side) => side.length !== 3))
        throw new Error('Flip requires two adjacent triangle faces.')
      const [[p, q, r], [, , s]] = sides
      if (area(positions, r, p, s) <= 1e-8 || area(positions, r, s, q) <= 1e-8 || faces.some((f) => incident(f, r, s)))
        throw new Error('The new diagonal must be inside a convex pair and unused.')
      added.push([r, p, s], [r, s, q])
    }
  } else throw new Error('Unknown mesh topology operation.')
  const cells = [...faces.filter((f) => !removed.has(f.id)).map((f) => f.vertices), ...added]
  const used = new Set(cells.flat()),
    mapping = new Map<number, number>()
  const vertexIds: string[] = [],
    xy: number[] = [],
    uv: number[] = []
  ids.forEach((id, i) => {
    if (!used.has(i)) return
    mapping.set(i, vertexIds.length)
    vertexIds.push(id)
    xy.push(positions[2 * i], positions[2 * i + 1])
    uv.push(uvs[2 * i], uvs[2 * i + 1])
  })
  const triangleIndices: number[] = [],
    quadIndices: number[] = []
  const trianglesOf = (v: readonly number[]) =>
    v.length === 4
      ? [
          [v[0], v[1], v[2]],
          [v[0], v[2], v[3]],
        ]
      : [v]
  const triKey = (values: readonly number[]) => [...values].sort((a, b) => a - b).join(':')
  const replacedTriangles = new Set(
    faces.filter((f) => removed.has(f.id)).flatMap((f) => trianglesOf(f.vertices).map(triKey)),
  )
  const originalTriangles = input.topology.triangleIndices
  for (let i = 0; i < originalTriangles.length; i += 3) {
    const tri = originalTriangles.slice(i, i + 3)
    if (!replacedTriangles.has(triKey(tri))) triangleIndices.push(...tri.map((v) => mapping.get(v)!))
  }
  for (const cell of added)
    for (const triangle of trianglesOf(cell)) triangleIndices.push(...triangle.map((v) => mapping.get(v)!))
  for (const cell of cells) if (cell.length === 4) quadIndices.push(...cell.map((v) => mapping.get(v)!))
  const next = { ...input.topology, vertexIds, triangleIndices, quadIndices }
  const geometry = {
    ...input,
    positions: xy,
    uvs: uv,
    textureReferenceBounds: input.textureReferenceBounds ?? computeMesh2DLocalBounds(input) ?? undefined,
    topology: { ...next, topologyHash: new Mesh2DTopologyHasher().hash(next) },
  }
  topology.prepare(geometry)
  return {
    geometry,
    get changes() {
      return meshTopologyChanges(input, geometry, edit)
    },
  }
}
