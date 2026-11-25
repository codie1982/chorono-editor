import type { OutlineResult } from './types'
import type { Matrix2D } from '../../geometry/Matrix2D'
import { buildSplineData } from '../util/buildSplineData'
import { mergeSplineData } from '../factory/mergeSplineData'
import { transformSplineData } from '../geometry/transformSplineData'
import type { SplinePathData } from '../../types/spline'

/** Worker world-space contours → ordinary editable local spline Objects.
 * Every point/edge/contour/Object gets a fresh ID via the existing builder.
 * Output is polygonal within the stated solver tolerance; original Bézier
 * records are never replaced or mislabeled as exact offset cubics. Closed
 * winding/holes and the target fillRule are preserved. No runtime DTO persists. */
export function outlineToSpline(result: OutlineResult, inverse: Matrix2D, fillRule: SplinePathData['fillRule']): SplinePathData {
  let data: SplinePathData = { points: {}, handles: {}, segments: {}, contours: {}, subShapes: {}, fillRule }
  for (const object of result.objects) {
    const built = buildSplineData({ kind: 'custom', name: object.name, source: 'edited', fillRule,
      contours: object.contours.map(contour => ({ closed: contour.closed, anchors: contour.points.map(point => ({ ...point, type: 'corner' as const })) })) })
    data = mergeSplineData(data, transformSplineData(built, inverse))
  }
  return data
}
