import type { SplinePathData } from '../../types/spline'
import { subShapeData } from '../geometry/elementPaths'
import { splineToPathDefinition } from '../splineToPath'
import { transformPathDefinition } from '../../geometry/transformPathDefinition'
import { flattenPathContours } from '../../geometry/flattenPathContours'
import { classifyPlanarBoundaries } from '../../geometry/planar/boundaries'
import type { Matrix2D } from '../../geometry/Matrix2D'
import { CORNER_LIMITS as limits } from './types'

/** Validate all boundaries of each affected Object, including unselected holes.
 * Curves are sampled only for intersection/winding validation at 0.01 world px;
 * returned source remains exact Bézier. Bounded O(vertices²) work belongs in
 * the CPU worker. Distinct Objects may intentionally overlap each other.
 * Reject unsupported self-contact and changed hole parents/winding/roles. */
export function validateCornerBoundaries(before: SplinePathData, after: SplinePathData, selected: ReadonlySet<string>, matrix: Matrix2D, label: string): void {
  let commands = 0, contours = 0, vertices = 0
  for (const object of Object.values(before.subShapes)) {
    if (!object.contourIds.some(id => before.contours[id].pointIds.some(point => selected.has(point)))) continue
    const boundaries = [before, after].map(data => {
      const path = transformPathDefinition(splineToPathDefinition(subShapeData(data, object.id)), matrix)
      commands += path.commands.length; contours += object.contourIds.length
      if (commands > limits.commands || contours > limits.contours * 2) throw new Error(`${label} boundary command/contour budget exceeded.`)
      const sampled = flattenPathContours(path, .01, limits.validationVertices - vertices, limits.contours, { label })
      vertices += sampled.reduce((n, c) => n + c.points.length, 0)
      return classifyPlanarBoundaries(sampled, data.fillRule)
    })
    const [a, b] = boundaries
    if (a.parents.some((parent, i) => parent !== b.parents[i] || a.roles[i] !== b.roles[i] || Math.sign(a.areas[i]) !== Math.sign(b.areas[i]))) throw new Error(`${label} changes hole ownership or collapses a boundary. Reduce the amount.`)
  }
}
