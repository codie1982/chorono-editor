import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData, newRectLayer } from '../../../defaults'
import { createDonutSpline, createRectangleSpline, appendSplineObjects, translateSplineData } from '../../../spline'
import { assertSplineTopology } from '../../../spline/topology'
import { PlanarOutlineBackend, type OutlineSettings } from '../../../spline/outline'
import { prepareSplineOutline, outlineSelection } from './outlinePlan'
import { prepareGeometryConversion } from '../../commands-geometry-conversion'
import { parseSceneJson } from '../../../format/scene/SceneJsonConverter'
const settings: OutlineSettings = { side: 'outside', distancePx: 5, join: 'miter', miterLimit: 4, tolerancePx: .25 }
function fixture() {
  const donut = createDonutSpline({ outerRadius: 100, innerRadius: 35 })
  const other = appendSplineObjects(donut, translateSplineData(createRectangleSpline({ width: 40, height: 40 }), 250, 0))
  const layer = newSplineLayerFromData(other.data), scene = { ...emptyScene(), layers: [layer] }
  return { scene, layer, id: Object.keys(donut.subShapes)[0], otherId: other.objectIds[0] }
}
function apply(base: ReturnType<typeof fixture>, mode: 'object' | 'edge', ids: string[]) {
  const plan = prepareSplineOutline(base.scene, base.layer.id, mode, ids, settings, 0, undefined, { resultMode: 'replace' })
  return plan.command(new PlanarOutlineBackend().compute(plan.request))
}
describe('native Offset replacement admission', () => {
  it('replaces the selected Object, preserves holes/unselected geometry/TRS/paint, creates no stack and has one Undo', () => {
    const base = fixture(), before = structuredClone(base.scene), prepared = apply(base, 'object', [base.id]), next = prepared.command.execute(base.scene)
    const data = next.layers[0].spline!, original = base.layer.spline!
    assertSplineTopology(data)
    expect(prepared.ids).toEqual([base.id]); expect(data.subShapes[base.id].contourIds).toHaveLength(2)
    expect(data.subShapes[base.otherId]).toBe(original.subShapes[base.otherId])
    const other = original.contours[original.subShapes[base.otherId].contourIds[0]]
    for (const id of other.pointIds) expect(data.points[id]).toBe(original.points[id])
    for (const id of original.subShapes[base.id].contourIds) expect(data.contours[id]).toBeUndefined()
    expect(next.layers[0].modifierStack).toBeUndefined()
    expect(next.layers[0].transform).toBe(base.layer.transform); expect(next.layers[0].style).toBe(base.layer.style)
    expect(prepared.command.undo(next)).toEqual(base.scene); expect(base.scene).toEqual(before)
    expect(parseSceneJson(JSON.stringify(next)).layers[0].spline).toEqual(data)
  })
  it('keeps a hole in its Object when only its complete edge contour is replaced, and refuses partial chains', () => {
    const base = fixture(), object = base.layer.spline!.subShapes[base.id], hole = base.layer.spline!.contours[object.contourIds[1]]
    expect(() => outlineSelection(base.layer.spline!, 'edge', [hole.segmentIds[0]], true)).toThrow(/every edge/)
    // Public legacy callers retain promotion, new replacement requests are strict.
    expect(outlineSelection(base.layer.spline!, 'edge', [hole.segmentIds[0]]).contourCount).toBe(1)
    expect(() => apply(base, 'edge', [hole.segmentIds[0]])).toThrow(/every edge/)
    const next = apply(base, 'edge', hole.segmentIds).command.execute(base.scene).layers[0].spline!
    expect(next.subShapes[base.id].contourIds).toHaveLength(2)
    expect(next.contours[object.contourIds[0]]).toBe(base.layer.spline!.contours[object.contourIds[0]])
    assertSplineTopology(next)
  })
  it('refuses removing read geometry and invalidates a plan on source change', () => {
    const base = fixture(), point = Object.keys(base.layer.spline!.points)[0]
    base.scene.timelines = [{ id: 't', durationMs: 1000, autoplay: false, loop: false, tracks: [] }]
    const prepared = apply(base, 'object', [base.id])
    expect(() => prepared.command.execute({ ...base.scene })).toThrow(/changed/)
    base.scene.timelines[0].tracks.push({ target: `layers.${base.layer.id}.spline.points.${point}.x`, keyframes: [{ id: 'keep-key', timeMs: 0, value: 2, easing: { type: 'linear' } }] })
    expect(() => apply(base, 'object', [base.id])).toThrow(/keyed|timeline/i)
  })
  it('replaces converted source geometry through its existing authored override', () => {
    const shape = newRectLayer(), scene = { ...emptyScene(), layers: [shape] }
    const converted = prepareGeometryConversion(scene, [shape.id], 'spline').command.execute(scene)
    const layer = converted.layers[0], id = Object.keys(layer.spline!.subShapes)[0]
    const plan = prepareSplineOutline(converted, layer.id, 'object', [id], settings, 0, undefined, { resultMode: 'replace' })
    const next = plan.command(new PlanarOutlineBackend().compute(plan.request)).command.execute(converted)
    expect(next.layers[0].spline!.subShapes[id]).toBeDefined()
    expect(next.layers[0].modifierStack?.modifiers.map(record => record.type)).toEqual(['convertSpline'])
  })
})

it('offsets only the picked Bézier edge and preserves neighboring curves and object ownership', () => {
  const base = fixture(),
    data = base.layer.spline!,
    c = data.contours[data.subShapes[base.id].contourIds[1]]
  const plan = prepareSplineOutline(
    base.scene,
    base.layer.id,
    'edge',
    [c.segmentIds[0]],
    { ...settings, side: 'left' },
    0,
    undefined,
    { resultMode: 'replace', allowChains: true },
  )
  expect(plan.closed).toBe(false)
  expect(plan.request.inputs[0].path.commands.filter((command) => command.type === 'C')).toHaveLength(1)
  const result = plan.command(new PlanarOutlineBackend().compute(plan.request))
  const next = result.command.execute(base.scene).layers[0].spline!
  expect(result.ids).toEqual([base.id])
  expect(next.segments[c.segmentIds[0]]).toBeUndefined()
  for (const id of c.segmentIds.slice(1)) expect(next.segments[id]).toEqual(data.segments[id])
  expect(next.subShapes[base.otherId]).toEqual(data.subShapes[base.otherId])
  assertSplineTopology(next)
})
