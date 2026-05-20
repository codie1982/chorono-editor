import type { BezierPath }        from '@/lib/types/path'
import type { PathAnchor }        from '@/lib/types/path'
import type { StarSplineParams }  from '@/lib/types/spline'

const KAPPA = 0.5523

export function createStarSpline(params: StarSplineParams): BezierPath {
  const { points, outerRadius: ro, innerRadius: ri, roundness = 0 } = params
  const count   = points * 2  // alternating outer/inner vertices
  const anchors: PathAnchor[] = []

  for (let i = 0; i < count; i++) {
    // 0° = 12 o'clock
    const a  = -Math.PI / 2 + (i * Math.PI) / points
    const r  = i % 2 === 0 ? ro : ri
    const x  = r * Math.cos(a)
    const y  = r * Math.sin(a)

    if (roundness <= 0) {
      anchors.push({ x, y, pointType: 'corner' })
    } else {
      const prevA = a - Math.PI / points
      const nextA = a + Math.PI / points
      const pr    = i % 2 === 0 ? ri : ro
      const nr    = i % 2 === 0 ? ri : ro

      const px = pr * Math.cos(prevA)
      const py = pr * Math.sin(prevA)
      const nx = nr * Math.cos(nextA)
      const ny = nr * Math.sin(nextA)

      const inLen  = Math.hypot(x - px, y - py) * roundness * KAPPA
      const outLen = Math.hypot(nx - x, ny - y) * roundness * KAPPA

      const itx = (x - px) / (Math.hypot(x - px, y - py) || 1)
      const ity = (y - py) / (Math.hypot(x - px, y - py) || 1)
      const otx = (nx - x) / (Math.hypot(nx - x, ny - y) || 1)
      const oty = (ny - y) / (Math.hypot(nx - x, ny - y) || 1)

      anchors.push({
        x, y,
        inX:  x - itx * inLen,
        inY:  y - ity * inLen,
        outX: x + otx * outLen,
        outY: y + oty * outLen,
        pointType: 'smooth',
      })
    }
  }

  return { closed: true, anchors }
}
