import type { BezierPath }       from '@/lib/types/path'
import type { PathAnchor }       from '@/lib/types/path'
import type { NGonSplineParams } from '@/lib/types/spline'

const KAPPA = 0.5523

export function createNGonSpline(params: NGonSplineParams): BezierPath {
  const { sides, radius: r, roundness = 0 } = params
  const anchors: PathAnchor[] = []
  const step = (2 * Math.PI) / sides

  for (let i = 0; i < sides; i++) {
    // 0° = 12 o'clock
    const a   = -Math.PI / 2 + i * step
    const x   = r * Math.cos(a)
    const y   = r * Math.sin(a)

    if (roundness <= 0) {
      anchors.push({ x, y, pointType: 'corner' })
    } else {
      // Handle length scales with roundness and the edge length (chord)
      const nextA = a + step
      const nx    = r * Math.cos(nextA)
      const ny    = r * Math.sin(nextA)
      const edgeLen = Math.hypot(nx - x, ny - y)
      const hLen  = edgeLen * roundness * KAPPA

      // Tangent direction along the polygon edge
      const tx = (nx - x) / (edgeLen || 1)
      const ty = (ny - y) / (edgeLen || 1)

      anchors.push({
        x, y,
        outX: x + tx * hLen,
        outY: y + ty * hLen,
        inX:  x - tx * hLen,
        inY:  y - ty * hLen,
        pointType: 'mirror',
      })
    }
  }

  return { closed: true, anchors }
}
