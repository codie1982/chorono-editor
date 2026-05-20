import type { BezierPath }          from '@/lib/types/path'
import type { RectSplineParams }     from '@/lib/types/spline'
import type { PathAnchor }           from '@/lib/types/path'

const KAPPA = 0.5523

export function createRectangleSpline(params: RectSplineParams): BezierPath {
  const { width: w, height: h, cornerRadius = 0, cornerMode = '4-point' } = params
  const hw = w / 2
  const hh = h / 2

  if (cornerMode === '4-point' || cornerRadius === 0) {
    // Simple 4-point rectangle centered at (0,0)
    return {
      closed: true,
      anchors: [
        { x: -hw, y: -hh, pointType: 'corner' },
        { x:  hw, y: -hh, pointType: 'corner' },
        { x:  hw, y:  hh, pointType: 'corner' },
        { x: -hw, y:  hh, pointType: 'corner' },
      ],
    }
  }

  if (cornerMode === '8-point') {
    // Chamfered — 8 straight-edge points
    const cr = Math.min(cornerRadius, Math.min(hw, hh))
    return {
      closed: true,
      anchors: [
        { x: -hw + cr, y: -hh,      pointType: 'corner' },
        { x:  hw - cr, y: -hh,      pointType: 'corner' },
        { x:  hw,      y: -hh + cr, pointType: 'corner' },
        { x:  hw,      y:  hh - cr, pointType: 'corner' },
        { x:  hw - cr, y:  hh,      pointType: 'corner' },
        { x: -hw + cr, y:  hh,      pointType: 'corner' },
        { x: -hw,      y:  hh - cr, pointType: 'corner' },
        { x: -hw,      y: -hh + cr, pointType: 'corner' },
      ],
    }
  }

  // cubic-rounded — 8 anchors with bezier handles for smooth corners
  const cr = Math.min(cornerRadius, Math.min(hw, hh))
  const k  = cr * KAPPA

  const anchors: PathAnchor[] = [
    // Top edge: left corner exit → right corner entry
    { x: -hw + cr, y: -hh,      outX: -hw + cr + k, outY: -hh,      inX: -hw + cr - k, inY: -hh,      pointType: 'mirror' },
    { x:  hw - cr, y: -hh,      outX:  hw - cr + k, outY: -hh,      inX:  hw - cr - k, inY: -hh,      pointType: 'mirror' },
    // Top-right corner curve
    { x:  hw,      y: -hh + cr, outX:  hw,           outY: -hh + cr + k, inX: hw, inY: -hh + cr - k, pointType: 'mirror' },
    // Right edge
    { x:  hw,      y:  hh - cr, outX:  hw,           outY:  hh - cr + k, inX: hw, inY:  hh - cr - k, pointType: 'mirror' },
    // Bottom-right corner
    { x:  hw - cr, y:  hh,      outX:  hw - cr - k,  outY:  hh,      inX: hw - cr + k, inY: hh,      pointType: 'mirror' },
    // Bottom edge
    { x: -hw + cr, y:  hh,      outX: -hw + cr - k,  outY:  hh,      inX: -hw + cr + k, inY: hh,     pointType: 'mirror' },
    // Bottom-left corner
    { x: -hw,      y:  hh - cr, outX: -hw,            outY:  hh - cr - k, inX: -hw, inY: hh - cr + k, pointType: 'mirror' },
    // Left edge
    { x: -hw,      y: -hh + cr, outX: -hw,            outY: -hh + cr - k, inX: -hw, inY: -hh + cr + k, pointType: 'mirror' },
  ]

  return { closed: true, anchors }
}
