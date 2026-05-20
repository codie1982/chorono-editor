import type { SplinePathData, CircleSplineParams } from '@/lib/types/spline'
import { buildSplineData } from '../util/buildSplineData'

const KAPPA = 0.5522847498307936

/** Circle centered at (0,0), 4 cubic anchors (kappa approximation). */
export function createCircleSpline(params: CircleSplineParams): SplinePathData {
  const r = params.radius
  const k = r * KAPPA
  return buildSplineData({
    kind: 'circle',
    name: 'Circle',
    params,
    contours: [{
      closed: true,
      anchors: [
        { x:  0, y: -r, type: 'bezier', out: { x:  k, y: -r }, in: { x: -k, y: -r } },
        { x:  r, y:  0, type: 'bezier', out: { x:  r, y:  k }, in: { x:  r, y: -k } },
        { x:  0, y:  r, type: 'bezier', out: { x: -k, y:  r }, in: { x:  k, y:  r } },
        { x: -r, y:  0, type: 'bezier', out: { x: -r, y: -k }, in: { x: -r, y:  k } },
      ],
    }],
  })
}
