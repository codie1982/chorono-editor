import type { BezierPath }           from '@/lib/types/path'
import type { EllipseSplineParams }   from '@/lib/types/spline'

const KAPPA = 0.5523

export function createEllipseSpline(params: EllipseSplineParams): BezierPath {
  const { radiusX: rx, radiusY: ry } = params
  const kx = rx * KAPPA
  const ky = ry * KAPPA

  return {
    closed: true,
    anchors: [
      { x:   0, y: -ry, outX:  kx, outY: -ry, inX: -kx, inY: -ry, pointType: 'mirror' },
      { x:  rx, y:   0, outX:  rx, outY:  ky, inX:  rx, inY: -ky, pointType: 'mirror' },
      { x:   0, y:  ry, outX: -kx, outY:  ry, inX:  kx, inY:  ry, pointType: 'mirror' },
      { x: -rx, y:   0, outX: -rx, outY: -ky, inX: -rx, inY:  ky, pointType: 'mirror' },
    ],
  }
}
