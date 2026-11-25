import type { SplinePathData, ArcSplineParams } from '@/lib/types/spline'
import type { AnchorSpec } from '../util/buildSplineData'
import { buildSplineData } from '../util/buildSplineData'
import { circularArcCubics } from '../../geometry/bezier/circularArc'

/**
 * Open circular arc, split into ≤90° cubic chunks. 0° = 12 o'clock.
 * Handle length per chunk: k = (4/3)·tan(Δ/4).
 */
export function createArcSpline(params: ArcSplineParams): SplinePathData {
  const { radius: r } = params
  const startRad = (params.startAngle - 90) * (Math.PI / 180)
  const endRad   = (params.endAngle   - 90) * (Math.PI / 180)

  const curves = circularArcCubics({ x: 0, y: 0 }, r, startRad, endRad - startRad, Infinity, Infinity)
  const anchors: AnchorSpec[] = curves.map((curve, i) => ({ ...curve[0], type: 'smooth', out: curve[1], ...(i ? { in: curves[i - 1][2] } : {}) }))
  anchors.push({ ...curves.at(-1)![3], type: 'smooth', in: curves.at(-1)![2] })

  return buildSplineData({
    kind: 'arc',
    name: 'Arc',
    params,
    combineMode: 'none',
    contours: [{ closed: false, anchors }],
  })
}
