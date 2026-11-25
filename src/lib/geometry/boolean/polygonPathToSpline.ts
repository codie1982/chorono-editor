import type { PathDefinition } from '../PathCommand'
import type { SplinePathData } from '../../types/spline'

/** Deterministic polygonal M/L/Z result → ordinary spline records. Holes and
 * islands retain the solver's nonzero winding. Generated IDs are local to this
 * result layer, not aliases of source point IDs and not keyframe targets.
 * Empty Boolean area is valid empty data. C/Q are not silently approximated. */
export function polygonPathToSpline(path: PathDefinition): SplinePathData {
  const data: SplinePathData = { points: {}, handles: {}, segments: {}, contours: {}, subShapes: {}, fillRule: 'nonzero' }
  let ids: string[] | null = null, n = 0, edges = 0, contours = 0
  for (const command of path.commands) {
    if (command.type === 'M') {
      if (ids) throw new Error('Boolean result contains an open contour.')
      ids = []
    }
    if (command.type === 'M' || command.type === 'L') {
      if (!ids) throw new Error('Boolean result has no contour start.')
      const id = `boolean_point_${n++}`; ids.push(id)
      data.points[id] = { id, x: command.x, y: command.y, type: 'corner' }
    } else if (command.type === 'Z') {
      if (!ids || ids.length < 3) throw new Error('Invalid Boolean result contour.')
      const id = `boolean_contour_${contours++}`
      const segmentIds = ids.map((pointId, i) => {
        const edge = `boolean_edge_${edges++}`
        data.segments[edge] = { id: edge, fromPointId: pointId, toPointId: ids![(i + 1) % ids!.length], type: 'line' }; return edge
      })
      data.contours[id] = { id, pointIds: ids, segmentIds, closed: true }; ids = null
    } else throw new Error('Boolean result must contain polygonal M/L/Z commands.')
  }
  if (ids) throw new Error('Boolean result contains an open contour.')
  const contourIds = Object.keys(data.contours)
  if (contourIds.length) data.subShapes.boolean_result = { id: 'boolean_result', name: 'Boolean result', kind: 'custom', source: 'generated', editable: false, combineMode: 'none', contourIds }
  return data
}
