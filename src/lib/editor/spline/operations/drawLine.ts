import type { SplinePathData } from '../../../types/spline'
import { extendSplineContour, appendSplineObjects } from '../../../spline'
import { buildSplineData } from '../../../spline/util/buildSplineData'
import { connectSplineEndpoints, assertSplineTopology } from '../../../spline/topology'
import { splineContinuation } from '../../../spline/edit/extendSplineContour'

interface Options { startPointId?: string; endPointId?: string; autoClose?: boolean; name?: string }
/** Headless equivalent of Add Line/Continue/vertex-acquired join. Local points
 * are NEW anchors only when continuing; explicit endpoint IDs replace mouse
 * hit-testing. No UI selection, snap preference or screen tolerance is written.
 * A reached endpoint is never cloned as a coincident point. Auto Close applies
 * at >=3 anchors; a two-anchor line stays open, matching native right-click. */
export function drawSplineLine(source: SplinePathData, points: readonly { x: number; y: number }[], options: Options) {
  if (!Array.isArray(points) || points.length > 2048 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Draw needs at most 2048 finite local points.')
  if (options.endPointId && !options.startPointId) throw new Error('A drawn join needs an explicit startPointId.')
  if (options.autoClose !== undefined && typeof options.autoClose !== 'boolean') throw new Error('autoClose must be boolean.')
  let data: SplinePathData, ids: string[], mode: 'point' | 'object'
  if (options.startPointId) {
    const start = splineContinuation(source, options.startPointId)
    if (!start) throw new Error('Continue requires an unlocked open endpoint.')
    const before = source.contours[start.contourId]
    data = extendSplineContour(source, options.startPointId, points, !!options.autoClose && !options.endPointId && before.pointIds.length + points.length >= 3)
    const contour = data.contours[start.contourId], tail = contour.pointIds[start.prepend ? 0 : contour.pointIds.length - 1]
    if (options.endPointId) {
      if (options.endPointId === options.startPointId) throw new Error('Use autoClose to close the continued contour.')
      data = connectSplineEndpoints(data, tail, options.endPointId)
    }
    mode = 'point'; ids = [options.endPointId ?? tail]
  } else {
    if (points.length < 2) throw new Error('A new line needs at least two local points.')
    const incoming = buildSplineData({ kind: 'custom', source: 'drawn', name: options.name ?? 'Line', contours: [{ closed: !!options.autoClose && points.length >= 3, anchors: points.map(p => ({ ...p, type: 'corner' })) }] })
    const appended = appendSplineObjects(source, incoming); data = appended.data; ids = appended.objectIds; mode = 'object'
  }
  assertSplineTopology(data)
  return { data, ids, mode }
}
