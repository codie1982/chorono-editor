import type { SplinePathData, RectSplineParams } from '@/lib/types/spline'
import type { AnchorSpec } from '../util/buildSplineData'
import { buildSplineData } from '../util/buildSplineData'

const KAPPA = 0.5522847498307936

/** Rectangle centered at (0,0). cornerMode: sharp (4pt) / chamfered (8pt) / rounded (cubic). */
export function createRectangleSpline(params: RectSplineParams): SplinePathData {
  const { width: w, height: h, cornerRadius = 0, cornerMode = 'sharp' } = params
  const hw = w / 2
  const hh = h / 2

  let anchors: AnchorSpec[]

  if (cornerMode === 'sharp' || cornerRadius <= 0) {
    anchors = [
      { x: -hw, y: -hh, type: 'corner' },
      { x:  hw, y: -hh, type: 'corner' },
      { x:  hw, y:  hh, type: 'corner' },
      { x: -hw, y:  hh, type: 'corner' },
    ]
  } else if (cornerMode === 'chamfered') {
    const cr = Math.min(cornerRadius, hw, hh)
    anchors = [
      { x: -hw + cr, y: -hh,      type: 'corner' },
      { x:  hw - cr, y: -hh,      type: 'corner' },
      { x:  hw,      y: -hh + cr, type: 'corner' },
      { x:  hw,      y:  hh - cr, type: 'corner' },
      { x:  hw - cr, y:  hh,      type: 'corner' },
      { x: -hw + cr, y:  hh,      type: 'corner' },
      { x: -hw,      y:  hh - cr, type: 'corner' },
      { x: -hw,      y: -hh + cr, type: 'corner' },
    ]
  } else {
    // rounded — cubic corners
    const cr = Math.min(cornerRadius, hw, hh)
    const k  = cr * KAPPA
    anchors = [
      { x: -hw + cr, y: -hh, type: 'smooth', in: { x: -hw + cr - k, y: -hh } },
      { x:  hw - cr, y: -hh, type: 'smooth', out: { x:  hw - cr + k, y: -hh } },
      { x:  hw, y: -hh + cr, type: 'smooth', in: { x: hw, y: -hh + cr - k } },
      { x:  hw, y:  hh - cr, type: 'smooth', out: { x: hw, y:  hh - cr + k } },
      { x:  hw - cr, y:  hh, type: 'smooth', in: { x: hw - cr + k, y: hh } },
      { x: -hw + cr, y:  hh, type: 'smooth', out: { x: -hw + cr - k, y: hh } },
      { x: -hw, y:  hh - cr, type: 'smooth', in: { x: -hw, y: hh - cr + k } },
      { x: -hw, y: -hh + cr, type: 'smooth', out: { x: -hw, y: -hh + cr - k } },
    ]
  }

  return buildSplineData({
    kind: 'rectangle',
    name: 'Rectangle',
    params,
    contours: [{ closed: true, anchors }],
  })
}
