import type { SplineVertexTarget, Vec2 } from './SnapCandidate'

/** Nearest complete vertex inside a radial composition-pixel tolerance.
 * Stable input order wins exact distance ties. Unlike axis alignment, X and Y
 * must belong to the SAME anchor. Invalid inputs/candidates are ignored. Pure,
 * O(n), no sorting/allocation of geometry; the host prepares targets per frame. */
export function nearestSplineVertex(vertices: readonly SplineVertexTarget[], point: Vec2, radius: number): SplineVertexTarget | undefined {
  if (![point.x, point.y, radius].every(Number.isFinite) || radius < 0) return
  let best: SplineVertexTarget | undefined, distance = radius * radius
  for (const vertex of vertices) {
    if (![vertex.x, vertex.y].every(Number.isFinite)) continue
    const next = (point.x - vertex.x) ** 2 + (point.y - vertex.y) ** 2
    if (next <= distance && (!best || next < distance)) { best = vertex; distance = next }
  }
  return best
}
