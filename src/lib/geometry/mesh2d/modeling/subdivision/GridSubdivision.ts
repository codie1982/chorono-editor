import polygonClipping, { type MultiPolygon } from 'polygon-clipping'
import cdt2d from 'cdt2d'
import type { MeshSubdivisionStrategy } from './types'
import { MeshRemeshingSource, meshCoordinate, pointKey, type Point2 } from './MeshRemeshingSource'
import { RemeshedGeometryBuilder } from './RemeshedGeometryBuilder'

type CellRegion = { polygons: MultiPolygon; x: number; y: number }
/** Square-cell (karelaj) remeshing over a source-local axis-aligned lattice.
 * Reuses polygon-clipping's existing robust intersection backend. Fully filled
 * squares retain explicit quad cells plus renderer triangles; partial boundary
 * cells are conforming constrained polygons/triangles, not filled AABBs. Shared
 * clipping cuts are inserted on both sides before triangulation, avoiding grid
 * T-junctions. No runtime state, hidden layers or per-frame data is retained. */
export class GridSubdivision implements MeshSubdivisionStrategy {
  readonly id = 'grid' as const
  /** Preserve source silhouette/holes while generating square cells at spacing. */
  generate(source: MeshRemeshingSource, spacing: number, namespace: string) {
    const b = source.bounds, columns = Math.ceil(b.width / spacing), rows = Math.ceil(b.height / spacing)
    if (columns * rows > 4096 || columns * rows * source.rings.reduce((n, ring) => n + ring.length, 0) > 2000000)
      throw new Error('Grid clipping budget exceeded. Increase cell size or reduce levels.')
    const regions: CellRegion[] = [], axis = new Map<string, Set<number>>()
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const x = meshCoordinate(b.x + col * spacing), y = meshCoordinate(b.y + row * spacing)
      const right = meshCoordinate(b.x + (col + 1) * spacing), bottom = meshCoordinate(b.y + (row + 1) * spacing)
      const polygons = polygonClipping.intersection(source.polygons, [[[x, y], [right, y], [right, bottom], [x, bottom], [x, y]]])
      if (!polygons.length) continue
      regions.push({ polygons, x, y })
      polygons.forEach(poly => poly.forEach(ring => ring.forEach(([px, py]) => {
        const xKey = `x:${meshCoordinate(px)}`, yKey = `y:${meshCoordinate(py)}`
        const ys = axis.get(xKey) ?? new Set<number>(), xs = axis.get(yKey) ?? new Set<number>()
        ys.add(meshCoordinate(py)); xs.add(meshCoordinate(px)); axis.set(xKey, ys); axis.set(yKey, xs)
      })))
    }
    const builder = new RemeshedGeometryBuilder(source, namespace)
    for (const region of regions) for (const poly of region.polygons) {
      const rings = poly.map(ring => this.conformingRing(ring.slice(0, -1), axis))
      const expected = new Set([[region.x, region.y], [meshCoordinate(region.x + spacing), region.y],
        [meshCoordinate(region.x + spacing), meshCoordinate(region.y + spacing)], [region.x, meshCoordinate(region.y + spacing)]].map(p => pointKey(p as [number, number])))
      if (rings.length === 1 && rings[0].length === 4 && rings[0].every(p => expected.has(pointKey(p)))) {
        const [a, c, d, e] = [[region.x, region.y], [region.x + spacing, region.y], [region.x + spacing, region.y + spacing], [region.x, region.y + spacing]].map(p => builder.vertex(p as [number, number]))
        builder.quad(a, c, d, e); continue
      }
      const points: [number, number][] = [], output: number[] = [], edges: [number, number][] = []
      rings.forEach(ring => {
        const base = points.length
        ring.forEach((point, index) => {
          points.push([point[0], point[1]]); output.push(builder.vertex(point)); edges.push([base + index, base + (index + 1) % ring.length])
        })
      })
      cdt2d(points, edges, { delaunay: false, interior: true, exterior: false, infinity: false }).forEach(([a, c, d]) => builder.triangle(output[a], output[c], output[d]))
    }
    return builder.finish()
  }
  /** Split shared horizontal/vertical edges at every neighboring cell cut. */
  private conformingRing(ring: readonly Point2[], axis: ReadonlyMap<string, Set<number>>): Point2[] {
    const result: Point2[] = []
    ring.forEach(([rawX, rawY], i) => {
      const a: Point2 = [meshCoordinate(rawX), meshCoordinate(rawY)], rawB = ring[(i + 1) % ring.length]
      const b: Point2 = [meshCoordinate(rawB[0]), meshCoordinate(rawB[1])]
      result.push(a)
      const vertical = a[0] === b[0], horizontal = a[1] === b[1]
      if (!vertical && !horizontal) return
      const first = vertical ? a[1] : a[0], last = vertical ? b[1] : b[0]
      const values = Array.from(axis.get(vertical ? `x:${a[0]}` : `y:${a[1]}`) ?? []).filter(value => value > Math.min(first, last) && value < Math.max(first, last)).sort((x, y) => first < last ? x - y : y - x)
      values.forEach(value => result.push(vertical ? [a[0], value] : [value, a[1]]))
    })
    return result
  }
}
