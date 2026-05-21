import type { SplinePathData, ArcSplineParams } from '@/lib/types/spline'
import type { AnchorSpec } from '../util/buildSplineData'
import { buildSplineData } from '../util/buildSplineData'

/**
 * Open circular arc, split into ≤90° cubic chunks. 0° = 12 o'clock.
 * Handle length per chunk: k = (4/3)·tan(Δ/4).
 */
export function createArcSpline(params: ArcSplineParams): SplinePathData {
  const { radius: r } = params
  const startRad = (params.startAngle - 90) * (Math.PI / 180)
  const endRad   = (params.endAngle   - 90) * (Math.PI / 180)

  const total = endRad - startRad
  const steps = Math.max(1, Math.ceil(Math.abs(total) / (Math.PI / 2)))
  const step  = total / steps
  const k     = (4 / 3) * Math.tan(step / 4)

  const anchors: AnchorSpec[] = []
  for (let i = 0; i <= steps; i++) {
    const a   = startRad + i * step
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const x   = r * cos
    const y   = r * sin

    const spec: AnchorSpec = { x, y, type: 'smooth' }
    // tangent direction (derivative of circle) scaled by k·r
    if (i < steps) spec.out = { x: x - k * r * sin, y: y + k * r * cos }
    if (i > 0)     spec.in  = { x: x + k * r * sin, y: y - k * r * cos }
    anchors.push(spec)
  }

  return buildSplineData({
    kind: 'arc',
    name: 'Arc',
    params,
    combineMode: 'none',
    contours: [{ closed: false, anchors }],
  })
}
