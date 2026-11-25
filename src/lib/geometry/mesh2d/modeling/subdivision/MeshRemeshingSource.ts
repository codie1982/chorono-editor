import { meshCoordinate } from '../../MeshPreparationPrecision'
export { meshCoordinate } from '../../MeshPreparationPrecision'
import type { MultiPolygon } from 'polygon-clipping'
import type { Mesh2DGeometry } from '../../../../types/mesh2d'
import { MeshModelingTopology } from '../MeshModelingTopology'
import { Mesh2DBoundaryRingExtractor } from '../../Mesh2DBoundaryRingExtractor'
import { computeMesh2DLocalBounds } from '../../Mesh2DGeometryQueries'
import { classifyPlanarBoundaries } from '../../../planar/boundaries'
import { MeshUVSampler } from './MeshUVSampler'

export type Point2 = readonly [number, number]
/** Bounded common remeshing input, prepared once per execution. Original IDs,
 * boundary ownership, material area and UV sampling are shared across strategies.
 * Coordinates use local pixels (±10M); duplicate positions with incompatible UVs
 * refuse rather than welding seams silently. Source is borrowed, scratch is job-owned. */
export class MeshRemeshingSource {
  readonly rings: readonly (readonly Point2[])[]
  readonly polygons: MultiPolygon
  readonly bounds: NonNullable<ReturnType<typeof computeMesh2DLocalBounds>>
  private readonly originalRecords = new Map<string, Readonly<{ id: string; uv: Point2 }>>()
  /** Read-only original vertex identity/UV lookup for output assembly. */
  get originals(): ReadonlyMap<string, Readonly<{ id: string; uv: Point2 }>> { return this.originalRecords }
  readonly sampler: MeshUVSampler
  readonly area: number
  constructor(readonly geometry: Mesh2DGeometry) {
    const adjacency = new MeshModelingTopology().prepare(geometry)
    if (adjacency.boundaryEdges.length > 2048 || geometry.topology.vertexIds.length > 8192) throw new Error('Subdivision source budget exceeded. Simplify the source.')
    if (geometry.positions.some(value => Math.abs(value) > 1e7)) throw new Error('Subdivision supports local coordinates within ±10 million px.')
    geometry.topology.vertexIds.forEach((id, i) => {
      const key = pointKey([geometry.positions[i * 2], geometry.positions[i * 2 + 1]]), uv = [geometry.uvs[i * 2], geometry.uvs[i * 2 + 1]] as const
      const previous = this.originalRecords.get(key)
      if (previous && (Math.abs(previous.uv[0] - uv[0]) > 1e-9 || Math.abs(previous.uv[1] - uv[1]) > 1e-9)) throw new Error('Subdivision cannot weld explicit UV seams. Use a continuous-UV source.')
      if (!previous) this.originalRecords.set(key, { id, uv })
    })
    const extracted = new Mesh2DBoundaryRingExtractor().extract(geometry)
    this.rings = extracted.map(ring => ring.points.map(p => [p.x, p.y] as const))
    classifyPlanarBoundaries(extracted.map(ring => ({ closed: true, points: ring.points.map(point => ({ ...point })) })), 'evenodd')
    this.polygons = extracted.flatMap((ring, index) => ring.role === 'outer' ? [[
      close(this.rings[index]), ...extracted.flatMap((hole, i) => hole.parentIndex === index && hole.role === 'hole' ? [close(this.rings[i])] : []),
    ]] : [])
    this.area = extracted.reduce((sum, ring) => sum + ring.signedDoubleArea / 2, 0)
    this.bounds = computeMesh2DLocalBounds(geometry)!
    this.sampler = new MeshUVSampler(geometry)
  }
  /** Exclude candidate sites on boundary constraints, including near contacts. */
  onBoundary([x, y]: Point2): boolean {
    return this.rings.some(ring => ring.some(([ax, ay], i) => {
      const [bx, by] = ring[(i + 1) % ring.length], dx = bx - ax, dy = by - ay
      return Math.abs(dx * (y - ay) - dy * (x - ax)) <= 1e-9 * Math.max(1, Math.hypot(dx, dy))
        && x >= Math.min(ax, bx) - 1e-9 && x <= Math.max(ax, bx) + 1e-9 && y >= Math.min(ay, by) - 1e-9 && y <= Math.max(ay, by) + 1e-9
    }))
  }
}
/** Stable coordinate key, shared by clipping/grid constraints and output welding. */
export function pointKey(point: Point2): string { return `${meshCoordinate(point[0])}:${meshCoordinate(point[1])}` }
/** Solver polygons repeat their closing vertex; caller rings do not. */
function close(ring: readonly Point2[]): [number, number][] { return [...ring, ring[0]].map(([x, y]) => [x, y]) }
