import { it, expect } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '../../defaults'
import { createDonutSpline } from '../../spline'
import { booleanTargets, prepareBooleanOperands } from './prepareBooleanOperands'
import { PolygonClippingBackend } from '../../geometry/boolean'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'

it('previews evaluated transformed parents and geometry without altering keys/source', () => {
  const scene = emptyScene(), parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }, a = { ...newRectLayer(), id: 'a', parentId: 'parent' }, b = { ...newRectLayer(), id: 'b' }
  scene.layers = [parent, a, b]; parent.transform.rotationDeg = 20; parent.transform.scaleX = 2
  scene.timelines = [{ id: 'main', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: 'layers.a.size.width', keyframes: [{ id: 'manual', timeMs: 0, value: 200, easing: { type: 'linear' } }] }] }]
  const before = JSON.stringify(scene), targets = booleanTargets(scene, new Set(['a', 'b']), 'b')
  expect(targets[0].layerId).toBe('b')
  const operands = prepareBooleanOperands(scene, targets, 0, evaluateSceneFrame(scene, 0).overrides)
  expect(operands[1].path.commands.length).toBeGreaterThan(3)
  expect(JSON.stringify(scene)).toBe(before)
  expect(operands[1].path.commands).not.toEqual(prepareBooleanOperands(scene, targets, 0, new Map())[1].path.commands)
})

it('preserves full ring and SubShape donut holes; diagnoses broken/unsupported input', () => {
  const scene = emptyScene(), ring = { ...newRectLayer(), id: 'ring', shapeKind: 'ring' as const }, outside = { ...newRectLayer(), id: 'outside' }
  ring.size = { width: 100, height: 100 }; outside.transform.x = 500
  scene.layers = [ring, outside]
  const targets = booleanTargets(scene, new Set(['ring', 'outside']), 'ring')
  const result = new PolygonClippingBackend().compute({ operation: 'union', reverse: false, tolerancePx: .25, operands: prepareBooleanOperands(scene, targets, 0, new Map()) })
  expect(result.holes).toBe(1)
  const donut = newSplineLayerFromData(createDonutSpline({ outerRadius: 50, innerRadius: 20 }), { name: 'Donut', x: 0, y: 0 }); scene.layers.push(donut)
  const subShapeId = Object.keys(donut.spline!.subShapes)[0]
  expect(prepareBooleanOperands(scene, [{ layerId: donut.id, subShapeId, label: 'Donut' }, targets[1]], 0, new Map())[0].fillRule).toBe(donut.spline!.fillRule)
  outside.parentId = 'missing'; expect(() => prepareBooleanOperands(scene, targets, 0, new Map())).toThrow(/parent/)
  delete outside.parentId; outside.type = 'text'; expect(() => prepareBooleanOperands(scene, targets, 0, new Map())).toThrow(/Basic Shapes/)
})
