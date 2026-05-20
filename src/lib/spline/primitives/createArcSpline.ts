import type { BezierPath }        from '@/lib/types/path'
import type { PathAnchor }        from '@/lib/types/path'
import type { ArcSplineParams }   from '@/lib/types/spline'

// Bezier approximation of a circular arc segment.
// Splits the arc into ≤90° chunks, each approximated with one cubic bezier.
const KAPPA = 0.5523

function arcChunkAnchors(
  r: number,
  startRad: number,
  endRad: number,
): PathAnchor[] {
  // Split into 90° chunks
  const totalAngle = endRad - startRad
  const steps      = Math.ceil(Math.abs(totalAngle) / (Math.PI / 2))
  const stepAngle  = totalAngle / steps
  const k          = (4 / 3) * Math.tan(stepAngle / 4)  // handle length for this arc segment

  const anchors: PathAnchor[] = []
  for (let i = 0; i <= steps; i++) {
    const a     = startRad + i * stepAngle
    const cos   = Math.cos(a)
    const sin   = Math.sin(a)
    const isLast = i === steps

    // Outgoing handle tangent (for curve to next point)
    const outX = isLast ? r * cos : r * cos - k * r * sin
    const outY = isLast ? r * sin : r * sin + k * r * cos
    // Incoming handle tangent (for curve from previous point)
    const inX  = i === 0 ? r * cos : r * cos + k * r * sin
    const inY  = i === 0 ? r * sin : r * sin - k * r * cos

    anchors.push({
      x: r * cos, y: r * sin,
      outX, outY,
      inX, inY,
      pointType: 'mirror',
    })
  }
  return anchors
}

export function createArcSpline(params: ArcSplineParams): BezierPath {
  // Degrees, 0 = 12 o'clock (same convention as ring/arc shapes)
  const startRad = (params.startAngle - 90) * (Math.PI / 180)
  const endRad   = (params.endAngle   - 90) * (Math.PI / 180)
  const anchors  = arcChunkAnchors(params.radius, startRad, endRad)
  return { closed: false, anchors }
}
