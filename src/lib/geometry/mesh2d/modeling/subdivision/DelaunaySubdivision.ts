import cdt2d from 'cdt2d'
import type { MeshSubdivisionStrategy } from './types'
import type { MeshRemeshingSource } from './MeshRemeshingSource'
import { RemeshedGeometryBuilder } from './RemeshedGeometryBuilder'

/** Constrained Delaunay remeshing, not midpoint splitting. Samples a triangular
 * lattice and preserves original vertices; segmented exterior/hole constraints
 * prevent convex-hull filling across notches, holes or disconnected islands.
 * cdt2d v1.0.0 performs robust constrained edge flipping and even-odd domain
 * classification. Job input is a validated PSLG, never centroid-filtered hull
 * triangles. Deterministic sampling, IDs and authored source-local px.
 * Contract: https://github.com/mikolalysenko/cdt2d#api
 */
export class DelaunaySubdivision implements MeshSubdivisionStrategy {
  readonly id = 'delaunay' as const
  /** Generate one independent constrained mesh at the requested site spacing. */
  generate(source: MeshRemeshingSource, spacing: number, namespace: string) {
    const builder = new RemeshedGeometryBuilder(source, namespace), edges: [number, number][] = []
    source.geometry.topology.vertexIds.forEach((_, i) => builder.vertex([source.geometry.positions[i * 2], source.geometry.positions[i * 2 + 1]]))
    source.rings.forEach(ring => {
      ring.forEach(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % ring.length], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / spacing))
        if (steps > 4096 || edges.length + steps > 4096) throw new Error('Delaunay boundary sampling budget exceeded. Increase cell size or reduce levels.')
        let previous = builder.vertex([ax, ay])
        for (let step = 1; step <= steps; step++) {
          const next = builder.vertex(step === steps ? [bx, by] : [ax + (bx - ax) * step / steps, ay + (by - ay) * step / steps])
          edges.push([previous, next]); previous = next
        }
      })
    })
    const b = source.bounds, rowHeight = spacing * Math.sqrt(3) / 2
    const columns = Math.ceil(b.width / spacing), rows = Math.ceil(b.height / rowHeight)
    if ((columns + 1) * (rows + 1) > 8192) throw new Error('Delaunay sampling budget exceeded. Increase cell size or reduce levels.')
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const point: [number, number] = [b.x + (col + (row % 2 ? .5 : 0)) * spacing, b.y + row * rowHeight]
      if (source.sampler.sample(...point) && !source.onBoundary(point)) builder.vertex(point)
    }
    const faces = cdt2d(builder.points, edges, { delaunay: true, interior: true, exterior: false, infinity: false })
    faces.forEach(([a, b, c]) => builder.triangle(a, b, c))
    return builder.finish()
  }
}
