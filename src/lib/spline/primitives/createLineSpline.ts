import type { BezierPath }       from '@/lib/types/path'
import type { LineSplineParams }  from '@/lib/types/spline'

export function createLineSpline(params: LineSplineParams): BezierPath {
  return {
    closed: false,
    anchors: [
      { x: params.x1, y: params.y1, pointType: 'corner' },
      { x: params.x2, y: params.y2, pointType: 'corner' },
    ],
  }
}
