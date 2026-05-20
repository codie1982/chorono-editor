import type { SplinePathData, NGonSplineParams } from '@/lib/types/spline'
import type { AnchorSpec } from '../util/buildSplineData'
import { buildSplineData } from '../util/buildSplineData'

const KAPPA = 0.5522847498307936

/** Regular N-gon centered at (0,0). 0° = 12 o'clock. Optional corner roundness. */
export function createNGonSpline(params: NGonSplineParams): SplinePathData {
  const { sides, radius: r, roundness = 0 } = params
  const step = (2 * Math.PI) / sides
  const anchors: AnchorSpec[] = []

  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + i * step
    const x = r * Math.cos(a)
    const y = r * Math.sin(a)

    if (roundness <= 0) {
      anchors.push({ x, y, type: 'corner' })
    } else {
      const na = a + step
      const nx = r * Math.cos(na)
      const ny = r * Math.sin(na)
      const edge = Math.hypot(nx - x, ny - y) || 1
      const hLen = edge * roundness * KAPPA
      const tx = (nx - x) / edge
      const ty = (ny - y) / edge
      anchors.push({
        x, y, type: 'smooth',
        out: { x: x + tx * hLen, y: y + ty * hLen },
        in:  { x: x - tx * hLen, y: y - ty * hLen },
      })
    }
  }

  return buildSplineData({
    kind: 'ngon',
    name: 'NGon',
    params,
    contours: [{ closed: true, anchors }],
  })
}
