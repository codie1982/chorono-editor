import type { SplinePathData } from '../../types/spline'
import type { PathDefinition } from '../../geometry'
import { splineToPathDefinition } from '../splineToPath'
import { hitTestSplinePoint, hitTestSplineHandle, hitTestSplineSegment, hitTestSplineFill } from '../geometry/hitTest'
import type { SplineEditMode } from './state'

export type SplinePick = { kind: 'point' | 'edge' | 'object'; id: string; t?: number }
  | { kind: 'handle'; id: string; pointId: string; handleKind: 'in' | 'out' }

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

/** Resolve one mode's hit in the supplied coordinate space. Canvas supplies
 * evaluated world data and tolerance in composition px = CSS radius / zoom.
 * Object boundary wins before fill; holes are tested with the existing fill
 * rule, and later SubShapes win overlapping areas. No cross-mode fallback. */
export function pickSplineElement(data: SplinePathData, mode: SplineEditMode, x: number, y: number, tolerance: number): SplinePick | null {
  if (mode === 'point') {
    const h = hitTestSplineHandle(data, x, y, tolerance)
    if (h) {
      const handle = Object.values(data.handles).find(item => item.pointId === h.pointId && item.kind === h.kind)
      if (handle) return { kind: 'handle', id: handle.id, pointId: h.pointId, handleKind: h.kind }
    }
    const id = hitTestSplinePoint(data, x, y, tolerance)
    return id ? { kind: 'point', id } : null
  }
  const edge = hitTestSplineSegment(data, x, y, tolerance)
  if (mode === 'edge') return edge ? { kind: 'edge', id: edge.segmentId, t: edge.t } : null
  const objects = Object.values(data.subShapes).reverse()
  if (edge) {
    const owner = objects.find(object => object.contourIds.some(id => data.contours[id]?.segmentIds.includes(edge.segmentId)))
    if (owner) return { kind: 'object', id: owner.id }
  }
  const owner = objects.find(object => hitTestSplineFill(subShapeData(data, object.id), x, y))
  return owner ? { kind: 'object', id: owner.id } : null
}
