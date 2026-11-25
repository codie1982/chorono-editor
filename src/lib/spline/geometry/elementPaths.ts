import type { SplinePathData } from '../../types/spline'
import type { PathDefinition } from '../../geometry/PathCommand'
import { splineToPathDefinition } from '../splineToPath'

/** Borrow all canonical records but expose one SubShape to the path/fill
 * converter. Includes every contour (e.g. donut hole); owns no new geometry. */
export function subShapeData(data: SplinePathData, id: string): SplinePathData {
  return { ...data, subShapes: data.subShapes[id] ? { [id]: data.subShapes[id] } : {} }
}

/** Canonical path for one edge, including quadratic control/cubic handles.
 * Synthetic contour IDs exist only for synchronous drawing/measurement. */
export function splineEdgePath(data: SplinePathData, id: string): PathDefinition {
  const segment = data.segments[id]
  if (!segment) return { commands: [], closed: false }
  return splineToPathDefinition({ ...data,
    subShapes: { edge: { id: 'edge', name: '', kind: 'custom', source: 'edited', contourIds: ['edge'], combineMode: 'none', editable: true } },
    contours: { edge: { id: 'edge', closed: false, pointIds: [segment.fromPointId, segment.toPointId], segmentIds: [id] } },
  })
}
