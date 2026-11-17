import { expect, it } from 'vitest'
import { createArcSpline } from './createArcSpline'
import { assertSplineTopology } from '../topology'
import { segmentControls } from '../corners'
import { evaluateBezier } from '../../geometry/bezier/curves'

it('preserves legacy clock-angle endpoints, oriented tangent handles and source metadata through the shared circular converter', () => {
  const params = { radius: 20, startAngle: 90, endAngle: 180 }, data = createArcSpline(params), contour = Object.values(data.contours)[0], object = Object.values(data.subShapes)[0]
  assertSplineTopology(data); expect(contour.closed).toBe(false); expect(contour.segmentIds).toHaveLength(1)
  const controls = segmentControls(data, contour.segmentIds[0])
  expect(controls[0].x).toBeCloseTo(20, 10); expect(controls[0].y).toBeCloseTo(0, 10)
  expect(controls[3].x).toBeCloseTo(0, 10); expect(controls[3].y).toBeCloseTo(20, 10)
  expect(controls[1].x).toBeCloseTo(20, 10); expect(controls[2].y).toBeCloseTo(20, 10)
  expect(object).toMatchObject({ kind: 'arc', source: 'generated', editable: false, combineMode: 'none', generatorParams: params })
})
it('keeps reversed full sweeps open with four cubic edges and preserves the legacy zero-sweep two anchors', () => {
  const data = createArcSpline({ radius: 25, startAngle: 270, endAngle: -90 }), contour = Object.values(data.contours)[0]
  expect(contour.closed).toBe(false); expect(contour.segmentIds).toHaveLength(4); expect(contour.pointIds).toHaveLength(5)
  for (const id of contour.segmentIds) { const p = evaluateBezier(segmentControls(data, id), .5); expect(Math.hypot(p.x, p.y)).toBeCloseTo(25, 2) }
  const zero = createArcSpline({ radius: 25, startAngle: 45, endAngle: 45 }), empty = Object.values(zero.contours)[0]
  expect(empty.pointIds).toHaveLength(2); expect(empty.segmentIds).toHaveLength(1)
  const controls = segmentControls(zero, empty.segmentIds[0]); expect(controls[0].x).toBe(controls[3].x); expect(controls[0].y).toBe(controls[3].y)
})
