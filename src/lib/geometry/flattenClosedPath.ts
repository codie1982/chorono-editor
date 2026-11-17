import type { PathDefinition } from './PathCommand'
import type { Vec2 } from './CoordinateSystem'
import { flattenPathContours } from './flattenPathContours'

/** Compatibility entry point: only explicitly closed contours, without a
 * duplicate closing vertex. Reuses the shared adaptive Bézier sampler; old
 * tolerance, budget and degenerate-input rules stay in force. */
export function flattenClosedPath(path: PathDefinition, tolerance: number, maxVertices: number, maxRings: number): Vec2[][] {
  return flattenPathContours(path, tolerance, maxVertices, maxRings, { requireClosed: true }).map(contour => contour.points)
}
