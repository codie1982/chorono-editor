import type { SplinePathData } from '../../types/spline'
import { Matrix2D } from '../../geometry/Matrix2D'
import { transformSplineData } from '../geometry/transformSplineData'
import type { SplineEditMode } from './state'

/** Expand native sub-object IDs into unique anchors. Objects own all contours,
 * including holes; edges own both endpoints. Missing/stale IDs are ignored.
 * No cached selection or geometry is written to source documents. */
export function splineSelectionPoints(data: SplinePathData, mode: SplineEditMode, ids: readonly string[]): Set<string> {
  const result = new Set<string>()
  for (const id of ids) {
    if (mode === 'point') { if (data.points[id]) result.add(id) }
    else if (mode === 'edge') {
      const edge = data.segments[id]
      if (edge) { result.add(edge.fromPointId); result.add(edge.toPointId) }
    } else for (const contourId of data.subShapes[id]?.contourIds ?? [])
      for (const point of data.contours[contourId]?.pointIds ?? []) result.add(point)
  }
  return result
}

/** Local anchor-bounds center used by numeric and pointer transforms alike.
 * Handles do not bias the pivot. Empty/invalid selections have no pivot. */
export function splineSelectionPivot(data: SplinePathData, ids: ReadonlySet<string>) {
  const points = Array.from(ids).map(id => data.points[id]).filter(Boolean)
  if (!points.length) return null
  return { x: (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2,
    y: (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2 }
}

/** Finite local affine edit around the shared anchor-bounds center. Translation
 * is local px, rotation clockwise degrees, scales positive factors. Source IDs,
 * topology, outer transforms and animation data are preserved. Zero/negative
 * scales are rejected rather than collapsing/flipping authored contours. */
export function transformSplineSelection(data: SplinePathData, ids: ReadonlySet<string>,
  transform: { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number }, editPivot?: {x:number;y:number}|null): SplinePathData {
  const { x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1 } = transform
  if (![x, y, rotation, scaleX, scaleY].every(Number.isFinite) || scaleX <= 0 || scaleY <= 0) throw new Error('Use finite transforms and positive scale factors.')
  const pivot = editPivot ?? splineSelectionPivot(data, ids)
  if (!pivot) return data
  const matrix = Matrix2D.translation(x + pivot.x, y + pivot.y).rotate(rotation).scale(scaleX, scaleY).translate(-pivot.x, -pivot.y)
  return transformSplineData(data, matrix, ids)
}
