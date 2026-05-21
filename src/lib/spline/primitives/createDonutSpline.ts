import type { SplinePathData, DonutSplineParams } from '@/lib/types/spline'
import { buildSplineData } from '../util/buildSplineData'

const KAPPA = 0.5522847498307936

function circleAnchors(r: number) {
  const k = r * KAPPA
  return [
    { x:  0, y: -r, type: 'bezier' as const, out: { x:  k, y: -r }, in: { x: -k, y: -r } },
    { x:  r, y:  0, type: 'bezier' as const, out: { x:  r, y:  k }, in: { x:  r, y: -k } },
    { x:  0, y:  r, type: 'bezier' as const, out: { x: -k, y:  r }, in: { x:  k, y:  r } },
    { x: -r, y:  0, type: 'bezier' as const, out: { x: -r, y: -k }, in: { x: -r, y:  k } },
  ]
}

/** Donut = outer + inner concentric circle contours, evenodd fill = hole. */
export function createDonutSpline(params: DonutSplineParams): SplinePathData {
  return buildSplineData({
    kind: 'donut',
    name: 'Donut',
    params,
    fillRule: 'evenodd',
    contours: [
      { closed: true, anchors: circleAnchors(params.outerRadius) },
      { closed: true, anchors: circleAnchors(params.innerRadius) },
    ],
  })
}
