import type { SplinePathData } from '../../types/spline'
import { divideSplineEdges } from '../topology/edges'
import { splineObjectSelection } from './objectSelection'
import { assertSplineInterpolation } from '../sampling/interpolation'
import { sampleContourEdges } from '../modeling/sampleContour'

/** Split every edge of explicit selected Objects into 2–64 equal parameter
 * pieces using existing exact De Casteljau division. Includes owned holes;
 * retains original anchors, Object/contour ownership and unrelated records.
 * Source is borrowed; native source/lock/reference guards own admission/Undo.
 * The existing 10,000-point/edge allocation guard refuses before publication. */
export function subdivideSplineObjects(data: SplinePathData, objectIds: readonly string[], parts = 2): SplinePathData {
  const selected = splineObjectSelection(data, objectIds)
  return divideSplineEdges(data, selected.contourIds.flatMap(id => data.contours[id].segmentIds), parts)
}

/** Author only Object sampling metadata; null restores omitted legacy policy.
 * Points/handles/segments/contours, primitive identity and layer TRS stay intact.
 * Preflight selected contour sampling against a total 8,192-sample UI budget;
 * unsupported/degenerate geometry refuses atomically without storing a setting
 * that cannot be evaluated. Repeating identical settings returns input identity. */
export function setSplineObjectInterpolation(data: SplinePathData, objectIds: readonly string[], tolerancePx: number | null): SplinePathData {
  const selected = splineObjectSelection(data, objectIds)
  const value = tolerancePx === null ? undefined : { version: 1 as const, tolerancePx }
  if (value) assertSplineInterpolation(value)
  const subShapes = { ...data.subShapes }; let changed = false
  for (const id of selected.objectIds) {
    const object = subShapes[id]
    if (object.interpolation?.tolerancePx === value?.tolerancePx) continue
    const { interpolation: _old, ...rest } = object
    subShapes[id] = value ? { ...rest, interpolation: { ...value } } : rest; changed = true
  }
  if (!changed) return data
  const next = { ...data, subShapes }; let samples = 0
  for (const id of selected.contourIds) {
    const sampled = sampleContourEdges(next, id)
    samples += sampled.edges.reduce((sum, edge) => sum + edge.points.length, 0)
    if (samples > 8192) throw new Error('Interpolation sample budget exceeded; increase tolerance or select fewer Objects.')
  }
  return next
}
