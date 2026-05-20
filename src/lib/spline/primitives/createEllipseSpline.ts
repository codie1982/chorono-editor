import type { SplinePathData, EllipseSplineParams } from '@/lib/types/spline'
import { buildSplineData } from '../util/buildSplineData'

const KAPPA = 0.5522847498307936

/** Ellipse centered at (0,0), 4 cubic anchors. */
export function createEllipseSpline(params: EllipseSplineParams): SplinePathData {
  const { radiusX: rx, radiusY: ry } = params
  const kx = rx * KAPPA
  const ky = ry * KAPPA
  return buildSplineData({
    kind: 'ellipse',
    name: 'Ellipse',
    params,
    contours: [{
      closed: true,
      anchors: [
        { x:   0, y: -ry, type: 'bezier', out: { x:  kx, y: -ry }, in: { x: -kx, y: -ry } },
        { x:  rx, y:   0, type: 'bezier', out: { x:  rx, y:  ky }, in: { x:  rx, y: -ky } },
        { x:   0, y:  ry, type: 'bezier', out: { x: -kx, y:  ry }, in: { x:  kx, y:  ry } },
        { x: -rx, y:   0, type: 'bezier', out: { x: -rx, y: -ky }, in: { x: -rx, y:  ky } },
      ],
    }],
  })
}
