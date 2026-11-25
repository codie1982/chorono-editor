import type { Mesh2DGeometry, Mesh2DSource } from '../../../types/mesh2d'

export interface MeshEditFace {
  readonly id: string
  readonly kind: 'quad' | 'triangle'
  readonly vertices: readonly number[]
}

/** Logical editing faces over validated renderer triangles. Explicit Grid quads
 * own their two triangles; remaining transition/Delaunay triangles stay faces.
 * IDs depend on stable vertex IDs, not positions or array order. Borrowed source
 * records are never changed and no geometry/cache/browser resources are owned. */
export class MeshFaceTopology {
  readonly faces: readonly MeshEditFace[]
  readonly hiddenDiagonals: ReadonlySet<string>
  constructor(geometry: Mesh2DGeometry, legacySource?: Mesh2DSource) {
    const covered = new Set<string>(), hidden = new Set<string>(), faces: MeshEditFace[] = []
    const quads = meshFaceQuads(geometry, legacySource)
    const face = (kind: MeshEditFace['kind'], vertices: number[]): MeshEditFace => ({ kind, vertices,
      id: `${kind}:${JSON.stringify(vertices.map(i => geometry.topology.vertexIds[i]).sort())}` })
    for (let i = 0; i < quads.length; i += 4) {
      const [a, b, c, d] = quads.slice(i, i + 4)
      faces.push(face('quad', [a, b, c, d]))
      covered.add(triangleKey(a, b, c)); covered.add(triangleKey(a, c, d))
      hidden.add(meshEdgeKey(a, c))
    }
    const triangles = geometry.topology.triangleIndices
    for (let i = 0; i < triangles.length; i += 3) {
      const indices = triangles.slice(i, i + 3)
      if (!covered.has(triangleKey(indices[0], indices[1], indices[2]))) faces.push(face('triangle', indices))
    }
    this.faces = faces; this.hiddenDiagonals = hidden
  }
}

/** Undirected index key shared by logical-edge presentation and picking. */
export function meshEdgeKey(a: number, b: number): string { return a < b ? `${a}:${b}` : `${b}:${a}` }

/** Orientation-independent identity for a validated triangle's connectivity. */
function triangleKey(a: number, b: number, c: number): string { return [a, b, c].sort((x, y) => x - y).join(':') }

/** Borrow explicit cells or recover a legacy structured-grid recipe ONLY when
 * its stable vertex layout and every triangle match. No arbitrary triangle
 * pairing, coordinate guessing, topology mutation or automatic file migration.
 * Both historical diagonal directions are supported, even after vertex edits. */
export function meshFaceQuads(geometry: Mesh2DGeometry, source?: Mesh2DSource): readonly number[] {
  if (geometry.topology.quadIndices) return geometry.topology.quadIndices
  if (source?.kind !== 'structuredGrid') return []
  const { columns, rows, diagonal } = source, width = columns + 1
  if (geometry.topology.vertexIds.length !== width * (rows + 1) || geometry.topology.triangleIndices.length !== columns * rows * 6) return []
  if (geometry.topology.vertexIds.some((id, i) => id !== `grid:${Math.floor(i / width)}:${i % width}`)) return []
  const triangles = new Set<string>(), input = geometry.topology.triangleIndices, cells: number[] = []
  for (let i = 0; i < input.length; i += 3) triangles.add(triangleKey(input[i], input[i + 1], input[i + 2]))
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const tl = row * width + column, tr = tl + 1, bl = tl + width, br = bl + 1
    const [a, b, c, d] = diagonal === 'topRightToBottomLeft' ? [tr, br, bl, tl] : [tl, tr, br, bl]
    if (!triangles.has(triangleKey(a, b, c)) || !triangles.has(triangleKey(a, c, d))) return []
    cells.push(a, b, c, d)
  }
  return cells
}
