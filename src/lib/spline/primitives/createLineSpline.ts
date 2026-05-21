import type { SplinePathData, LineSplineParams } from '@/lib/types/spline'
import { buildSplineData } from '../util/buildSplineData'

/** Open two-point line. */
export function createLineSpline(params: LineSplineParams): SplinePathData {
  return buildSplineData({
    kind: 'line',
    name: 'Line',
    params,
    combineMode: 'none',
    contours: [{
      closed: false,
      anchors: [
        { x: params.x1, y: params.y1, type: 'corner' },
        { x: params.x2, y: params.y2, type: 'corner' },
      ],
    }],
  })
}
