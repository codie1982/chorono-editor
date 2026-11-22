import type { SplinePathData } from '../../types/spline'
import { hitTestSplinePoint, hitTestSplineHandle, hitTestSplineSegment, hitTestSplineFill } from '../geometry/hitTest'
import type { SplineEditMode } from './state'

export type SplinePick = { kind: 'point' | 'edge' | 'object'; id: string; t?: number }
  | { kind: 'handle'; id: string; pointId: string; handleKind: 'in' | 'out' }

export { subShapeData, splineEdgePath } from '../geometry/elementPaths'
import { subShapeData } from '../geometry/elementPaths'

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
