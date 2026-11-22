import type { Mesh2DGeometry } from '../../../types/mesh2d'
import { Mesh2DBoundaryRingExtractor } from '../Mesh2DBoundaryRingExtractor'
import { classifyPlanarBoundaries } from '../../planar/boundaries'

/** Per-job boundary-motion admission. Reuses canonical robust planar predicates
 * to reject self-contact, crossing, vanished holes and changed island nesting.
 * Quadratic boundary checks are bounded to 2048 vertices; fixed-boundary jobs
 * need no motion guard. Owns only detached ring index arrays for this call. */
export class MeshBoundaryMotionGuard {
  private readonly rings: readonly (readonly number[])[]
  private readonly original: ReturnType<typeof classifyPlanarBoundaries>
  constructor(input: Mesh2DGeometry, boundaryVertices: number) {
    if (boundaryVertices > 2048) throw new Error('Smooth boundary limit exceeded. Enable Keep boundary or reduce Subdivision levels.')
    this.rings = new Mesh2DBoundaryRingExtractor().extract(input).map(ring => ring.vertexIndices)
    this.original = this.classify(input.positions)
  }
  /** Final boundary must remain simple, disjoint/nested and retain hole ownership. */
  assert(positions: readonly number[]): void {
    const result = this.classify(positions)
    if (result.roles.some((role, i) => role !== this.original.roles[i] || result.parents[i] !== this.original.parents[i]))
      throw new Error('Smooth would change hole or island containment. Reduce strength or enable Keep boundary.')
  }
  /** Interpret stable boundary indices in the supplied source-local position array. */
  private classify(positions: readonly number[]) {
    return classifyPlanarBoundaries(this.rings.map(indices => ({ closed: true,
      points: indices.map(vertex => ({ x: positions[vertex * 2], y: positions[vertex * 2 + 1] })) })), 'evenodd')
  }
}
