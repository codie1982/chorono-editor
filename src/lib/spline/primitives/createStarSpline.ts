import type { SplinePathData, StarSplineParams } from '@/lib/types/spline'
import type { AnchorSpec } from '../util/buildSplineData'
import { buildSplineData } from '../util/buildSplineData'

const KAPPA = 0.5522847498307936

/** Star with alternating outer/inner radii. 0° = 12 o'clock. Optional roundness. */
export function createStarSpline(params: StarSplineParams): SplinePathData {
  const { points, outerRadius: ro, innerRadius: ri, roundness = 0 } = params
  const count = points * 2
  const anchors: AnchorSpec[] = []

  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points
    const r = i % 2 === 0 ? ro : ri
    const x = r * Math.cos(a)
    const y = r * Math.sin(a)

    if (roundness <= 0) {
      anchors.push({ x, y, type: 'corner' })
    } else {
      const prevA = a - Math.PI / points
      const nextA = a + Math.PI / points
      const pr = i % 2 === 0 ? ri : ro
      const nr = i % 2 === 0 ? ri : ro
      const px = pr * Math.cos(prevA), py = pr * Math.sin(prevA)
      const nx = nr * Math.cos(nextA), ny = nr * Math.sin(nextA)
      const inLen  = Math.hypot(x - px, y - py) || 1
      const outLen = Math.hypot(nx - x, ny - y) || 1
      const itx = (x - px) / inLen,  ity = (y - py) / inLen
      const otx = (nx - x) / outLen, oty = (ny - y) / outLen
      anchors.push({
        x, y, type: 'smooth',
        in:  { x: x - itx * inLen  * roundness * KAPPA, y: y - ity * inLen  * roundness * KAPPA },
        out: { x: x + otx * outLen * roundness * KAPPA, y: y + oty * outLen * roundness * KAPPA },
      })
    }
  }

  return buildSplineData({
    kind: 'star',
    name: 'Star',
    params,
    contours: [{ closed: true, anchors }],
  })
}
