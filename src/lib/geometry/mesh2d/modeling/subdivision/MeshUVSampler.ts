import type { Mesh2DGeometry } from '../../../../types/mesh2d'
import { computeMesh2DLocalBounds } from '../../Mesh2DGeometryQueries'

/** Per-job spatial lookup of the source piecewise-linear UV field. Borrows
 * immutable geometry, owns a bounded uniform triangle bucket index. Exact for
 * affine UVs; remeshing interpolates other continuous UV fields at new vertices.
 * No GPU/media data. Work/cell limits fail before unbounded synchronous queries. */
export class MeshUVSampler {
  private readonly buckets = new Map<number, number[]>()
  private readonly bounds: NonNullable<ReturnType<typeof computeMesh2DLocalBounds>>
  private readonly divisions: number
  private visits = 0
  constructor(private readonly input: Mesh2DGeometry) {
    this.bounds = computeMesh2DLocalBounds(input)!
    this.divisions = Math.max(1, Math.min(32, Math.ceil(Math.sqrt(input.topology.triangleIndices.length / 3))))
    let entries = 0
    for (let offset = 0; offset < input.topology.triangleIndices.length; offset += 3) {
      const vertices = input.topology.triangleIndices.slice(offset, offset + 3)
      const xs = vertices.map(i => input.positions[i * 2]), ys = vertices.map(i => input.positions[i * 2 + 1])
      const [x0, y0] = this.cell(Math.min(...xs), Math.min(...ys)), [x1, y1] = this.cell(Math.max(...xs), Math.max(...ys))
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (++entries > 2000000) throw new Error('Subdivision source spatial budget exceeded.')
        const key = y * this.divisions + x, bucket = this.buckets.get(key) ?? []
        bucket.push(offset); this.buckets.set(key, bucket)
      }
    }
  }
  /** UV hit including boundaries, or null outside the actual triangles. */
  sample(x: number, y: number): readonly [number, number] | null {
    const [cx, cy] = this.cell(x, y), { positions: p, uvs, topology: { triangleIndices: faces } } = this.input
    for (const offset of this.buckets.get(cy * this.divisions + cx) ?? []) {
      if (++this.visits > 8000000) throw new Error('Subdivision UV sampling budget exceeded. Reduce detail.')
      const a = faces[offset], b = faces[offset + 1], c = faces[offset + 2]
      const ax = p[a * 2], ay = p[a * 2 + 1], bx = p[b * 2], by = p[b * 2 + 1], dx = p[c * 2], dy = p[c * 2 + 1]
      const area = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax)
      const wb = ((x - ax) * (dy - ay) - (y - ay) * (dx - ax)) / area
      const wc = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / area, wa = 1 - wb - wc
      if (Math.min(wa, wb, wc) >= -1e-8) return [wa * uvs[a * 2] + wb * uvs[b * 2] + wc * uvs[c * 2], wa * uvs[a * 2 + 1] + wb * uvs[b * 2 + 1] + wc * uvs[c * 2 + 1]]
    }
    return null
  }
  /** Clamp query coordinates to the finite source index; hits still test faces. */
  private cell(x: number, y: number): [number, number] {
    const b = this.bounds, n = this.divisions
    return [Math.max(0, Math.min(n - 1, Math.floor((x - b.x) / b.width * n))), Math.max(0, Math.min(n - 1, Math.floor((y - b.y) / b.height * n)))]
  }
}
